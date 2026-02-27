"""
Tech Shot image processing — SAM segmentation and compositing.

Local dev:  SAM vit_h on Apple MPS (set TECHSHOT_DIECUT_MODE=sam, default)
Production: FAL BiRefNet v2 API   (set TECHSHOT_DIECUT_MODE=fal + FAL_KEY)
"""

import io
import gc
import os
import logging
import tempfile
import numpy as np
import cv2
from PIL import Image

logger = logging.getLogger(__name__)

SAM_CHECKPOINT = "/Users/sirasasitorn/Documents/VScode/Archive/turfmapp-ai-inpainting/backend/models/sams/sam_vit_h_4b8939.pth"
SAM_MODEL_TYPE = "vit_h"

_sam_predictor = None


def _get_sam_predictor():
    global _sam_predictor
    if _sam_predictor is None:
        import torch
        from segment_anything import sam_model_registry, SamPredictor

        device = "mps" if torch.backends.mps.is_available() else "cpu"
        logger.info(f"[techshot] Loading SAM {SAM_MODEL_TYPE} on {device}...")
        sam = sam_model_registry[SAM_MODEL_TYPE](checkpoint=SAM_CHECKPOINT)
        sam.to(device=device)
        _sam_predictor = SamPredictor(sam)
        logger.info("[techshot] SAM ready")
    return _sam_predictor


def segment_with_sam(image_bytes: bytes, click_x_ratio: float, click_y_ratio: float) -> bytes:
    """
    Extract the clicked object using SAM point-prompt segmentation.
    Identical logic to turfmapp-ai-inpainting extract_object_from_point().
    """
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    orig_w, orig_h = image.size

    predictor = _get_sam_predictor()

    # SAM inference at 1024×1024
    sam_size = (1024, 1024)
    image_for_sam = image.resize(sam_size, Image.Resampling.LANCZOS)
    image_np = np.array(image_for_sam)

    # Scale click from display → SAM space
    click_x = int(click_x_ratio * orig_w)
    click_y = int(click_y_ratio * orig_h)
    scaled = [int(click_x * sam_size[0] / orig_w), int(click_y * sam_size[1] / orig_h)]

    predictor.set_image(image_np)
    masks, scores, _ = predictor.predict(
        point_coords=np.array([scaled]),
        point_labels=np.array([1]),
        multimask_output=True,
    )

    best_mask = masks[np.argmax(scores)]
    del masks, scores, image_np, image_for_sam

    # Resize mask back to original resolution + soft edges
    mask_img = Image.fromarray(best_mask.astype(np.uint8) * 255)
    mask_resized = mask_img.resize(image.size, Image.Resampling.LANCZOS)
    mask_np = cv2.GaussianBlur(np.array(mask_resized), (3, 3), 0)
    del mask_img, best_mask

    # RGBA with premultiplied alpha (avoids fringe)
    rgba = np.array(image.convert("RGBA"))
    rgba[:, :, 3] = mask_np
    alpha_norm = (mask_np.astype(np.float32) / 255.0)[..., None]
    rgba[:, :, :3] = (rgba[:, :, :3].astype(np.float32) * alpha_norm).astype(np.uint8)

    out = Image.fromarray(rgba, "RGBA")
    buf = io.BytesIO()
    out.save(buf, format="PNG")
    del rgba, mask_np, alpha_norm
    gc.collect()
    return buf.getvalue()


def composite_images(bg_bytes: bytes, mask_bytes: bytes, segmented_bytes: bytes, draw_bbox: bool = True) -> bytes:
    """
    Composite workflow:
    1. Derive bounding box from the white region of the mask image.
    2. Scale that bbox to the background's coordinate space.
    3. Draw a red rectangle on the background at that bbox.
    4. Scale the diecut (segmented RGBA) to fill the bbox as much as possible.
    5. Center the diecut inside the bbox and paste it on top.
    """
    from PIL import ImageDraw

    bg = Image.open(io.BytesIO(bg_bytes)).convert("RGBA")
    segmented = Image.open(io.BytesIO(segmented_bytes)).convert("RGBA")
    bg_w, bg_h = bg.size

    # ── Decode mask and find white-region bbox ──────────────────────────────
    arr = np.frombuffer(mask_bytes, np.uint8)
    mask_img = cv2.imdecode(arr, cv2.IMREAD_GRAYSCALE)
    if mask_img is None:
        raise ValueError("Could not decode mask image")
    mask_h_px, mask_w_px = mask_img.shape
    _, thresh = cv2.threshold(mask_img, 127, 255, cv2.THRESH_BINARY)
    pts = cv2.findNonZero(thresh)
    if pts is None:
        raise ValueError("Mask contains no white region")
    mx, my, mw, mh = cv2.boundingRect(pts)

    # ── Scale mask bbox → background coordinate space ───────────────────────
    sx = bg_w / mask_w_px
    sy = bg_h / mask_h_px
    bbox_x = int(mx * sx)
    bbox_y = int(my * sy)
    bbox_w = int(mw * sx)
    bbox_h = int(mh * sy)

    # ── Tight-crop diecut to its alpha content ──────────────────────────────
    alpha_bbox = segmented.split()[-1].getbbox()
    if alpha_bbox:
        segmented = segmented.crop(alpha_bbox)

    # ── Scale diecut to fill bbox (preserve aspect ratio) ───────────────────
    seg_w, seg_h = segmented.size
    fit_scale = min(bbox_w / seg_w, bbox_h / seg_h)
    new_w = int(seg_w * fit_scale)
    new_h = int(seg_h * fit_scale)
    segmented_resized = segmented.resize((new_w, new_h), Image.LANCZOS)

    # ── Center diecut within bbox ────────────────────────────────────────────
    paste_x = bbox_x + (bbox_w - new_w) // 2
    paste_y = bbox_y + (bbox_h - new_h) // 2

    result = bg.copy()

    # ── Draw red bounding box on background (preview only) ───────────────────
    if draw_bbox:
        draw = ImageDraw.Draw(result)
        draw.rectangle(
            [bbox_x, bbox_y, bbox_x + bbox_w - 1, bbox_y + bbox_h - 1],
            outline=(255, 0, 0, 255),
            width=3,
        )

    # ── Paste diecut inside the red box ──────────────────────────────────────
    result.paste(segmented_resized, (paste_x, paste_y), segmented_resized)

    buf = io.BytesIO()
    result.convert("RGB").save(buf, format="PNG")
    return buf.getvalue()


# ─── FAL BiRefNet (production) ────────────────────────────────────────────────

def segment_with_fal(image_bytes: bytes) -> bytes:
    """
    Background removal via FAL BiRefNet v2 API.
    Used in production where MPS/GPU is not available.
    Requires FAL_KEY environment variable.
    """
    import fal_client
    import requests as req

    with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as tmp:
        tmp.write(image_bytes)
        tmp_path = tmp.name

    try:
        logger.info("[techshot] Uploading to FAL...")
        img_url = fal_client.upload_file(tmp_path)

        logger.info("[techshot] Running BiRefNet v2...")
        result = fal_client.subscribe("fal-ai/birefnet/v2", arguments={
            "image_url": img_url,
            "model": "General Use (Heavy)",
            "operating_resolution": "2048x2048",
            "output_format": "png",
            "refine_foreground": True,
        })

        output_url = result["image"]["url"]
        r = req.get(output_url, timeout=120)
        r.raise_for_status()
        logger.info(f"[techshot] FAL BiRefNet done: {len(r.content)//1024}KB")
        return r.content
    finally:
        os.unlink(tmp_path)


# ─── Dispatcher ───────────────────────────────────────────────────────────────

def segment_object(image_bytes: bytes, click_x_ratio: float, click_y_ratio: float) -> bytes:
    """
    Route to the correct segmentation backend:
      TECHSHOT_DIECUT_MODE=sam  → SAM vit_h on Apple MPS (default, local dev)
      TECHSHOT_DIECUT_MODE=fal  → FAL BiRefNet v2 API (production)
    """
    mode = os.environ.get("TECHSHOT_DIECUT_MODE", "sam").lower()
    if mode == "fal":
        return segment_with_fal(image_bytes)
    return segment_with_sam(image_bytes, click_x_ratio, click_y_ratio)
