"""
Pack Detector Module
Detects which pack a filename belongs to based on keyTokens.
"""

from typing import Dict, Any, Optional, List


class PackDetectionError(Exception):
    """Base exception for pack detection errors."""
    pass


class PackNotFoundError(PackDetectionError):
    """Raised when no pack matches the filename."""
    pass


class PackAmbiguousError(PackDetectionError):
    """Raised when multiple packs match the filename."""
    pass


class PackDetector:
    def __init__(self, packs: List[Dict[str, Any]]):
        """
        Initialize the pack detector.
        
        Args:
            packs: List of pack configurations from config
        """
        self.packs = packs
    
    def detect(self, filename: str) -> Dict[str, Any]:
        """
        Detect which pack the filename belongs to.

        The pack order number is expected in the second segment of the filename (split by underscores).
        Format: SEASON_PACK_ORDER_RULE_CODE_MODEL_SIZE.EXT (e.g., 27SS_01_T04_A3E_HI_4x5.jpg)

        Args:
            filename: The filename to analyze

        Returns:
            Dict containing pack information (id, folder, etc.)

        Raises:
            PackNotFoundError: If no pack matches
            PackAmbiguousError: If multiple packs match
        """
        # Remove file extension
        name_without_ext = filename.rsplit(".", 1)[0] if "." in filename else filename
        segments = name_without_ext.split("_")

        # Pack order should be in the second segment (index 1)
        if len(segments) < 2:
            raise PackNotFoundError(
                f"Invalid filename format: {filename}. "
                f"Expected format: SEASON_PACK_ORDER_RULE_CODE_MODEL_SIZE.EXT"
            )

        pack_order_str = segments[1].lower()

        matched_packs = []
        for pack in self.packs:
            order = pack.get("order")
            if order is None:
                continue

            # Format order as zero-padded 2-digit string (e.g., "01", "02", "03", "04")
            order_str = f"{order:02d}"

            # Check if the pack order segment matches
            if pack_order_str == order_str:
                matched_packs.append(pack)

        # Handle results
        if len(matched_packs) == 0:
            raise PackNotFoundError(
                f"No pack found for filename: {filename}. "
                f"Second segment must be pack order (01, 02, 03, or 04)."
            )

        if len(matched_packs) > 1:
            pack_names = [p.get("folder", p.get("id")) for p in matched_packs]
            raise PackAmbiguousError(
                f"Multiple packs match filename: {filename}. "
                f"Matched packs: {', '.join(pack_names)}"
            )

        return matched_packs[0]


def detect_pack(filename: str, packs: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Convenience function to detect pack.
    
    Args:
        filename: The filename to analyze
        packs: List of pack configurations
    
    Returns:
        Dict containing pack information
    """
    detector = PackDetector(packs)
    return detector.detect(filename)
