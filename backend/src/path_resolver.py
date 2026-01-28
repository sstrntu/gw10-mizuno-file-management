"""
Path Resolver Module
Resolves placeholders in path templates to create final folder paths.
"""

from typing import Dict, Any, List, Optional


class PathResolver:
    def __init__(self, config: Dict[str, Any]):
        """
        Initialize the path resolver.

        Args:
            config: Full configuration object
        """
        self.config = config
        self.folders = config.get("folders", {})
        self.color_pack = config.get("colorPack", {})
        self.root_folder = config.get("drive", {}).get("rootFolder", "")
    
    def resolve(
        self,
        path_template: List[str],
        pack_info: Dict[str, Any],
        model_info: Optional[Dict[str, Any]] = None,
        filename: str = ""
    ) -> Dict[str, Any]:
        """
        Resolve placeholders in path template.

        Args:
            path_template: List of path segments with placeholders
            pack_info: Pack information
            model_info: Optional model information
            filename: Original filename (needed for CP code extraction)

        Returns:
            Dict with:
                - path_parts: List of resolved path segments
                - path_string: Full path as string
                - tree_string: Pretty tree representation
        """
        resolved_parts = []

        for segment in path_template:
            resolved_segment = self._resolve_placeholder(segment, pack_info, model_info, filename)
            resolved_parts.append(resolved_segment)

        # Build full path with root folder
        full_path_parts = [self.root_folder] + resolved_parts
        path_string = "/".join(full_path_parts)

        # Build tree representation
        tree_string = self._build_tree(full_path_parts)

        return {
            "path_parts": resolved_parts,
            "full_path": path_string,
            "tree": tree_string
        }
    
    def _resolve_placeholder(
        self,
        placeholder: str,
        pack_info: Dict[str, Any],
        model_info: Optional[Dict[str, Any]],
        filename: str = ""
    ) -> str:
        """
        Resolve a single placeholder.

        Args:
            placeholder: The placeholder string (e.g., "{PACK_FOLDER}")
            pack_info: Pack information
            model_info: Optional model information
            filename: Original filename (for CP code extraction)

        Returns:
            Resolved string
        """
        # Pack folder
        if placeholder == "{PACK_FOLDER}":
            return pack_info.get("folder", "")

        # Model folder
        if placeholder == "{MODEL_FOLDER}":
            if model_info:
                return model_info.get("folder", "")
            return ""

        # Color Pack Option - extract CP code from filename and map to folder
        if placeholder == "{COLOR_PACK_OPTION}":
            return self._resolve_color_pack_option(filename, pack_info)

        # Categories from folders.json
        categories = self.folders.get("categories", {})

        if placeholder == "{KEY_VISUAL}":
            return categories.get("keyVisual", "")

        if placeholder == "{TECH_SHOTS}":
            return categories.get("techShots", "")

        if placeholder == "{SUPPORTING}":
            return categories.get("supporting", "")

        if placeholder == "{CAROUSEL}":
            return categories.get("carousel", "")

        # KV subfolders
        kv_subfolders = self.folders.get("kvSubfolders", {})

        if placeholder == "{KV_COLOR_PACK}":
            return kv_subfolders.get("colorPack", "")

        if placeholder == "{KV_PSD}":
            return kv_subfolders.get("psd", "")

        # If no match, return as-is (shouldn't happen with valid config)
        return placeholder

    def _resolve_color_pack_option(self, filename: str, pack_info: Dict[str, Any]) -> str:
        """
        Extract CP code from filename and map to Color Pack option folder.

        Args:
            filename: Original filename (e.g., "27SS_03_CP_EMEA_16x9.jpg")
            pack_info: Pack information

        Returns:
            Color Pack option folder name (e.g., "Option 1 (EMEA)")
        """
        # Extract CP code from filename
        # Format: 27SS_##_CP_[CODE]_...
        parts = filename.split('_')
        cp_code = None

        for i, part in enumerate(parts):
            if part == 'CP' and i + 1 < len(parts):
                cp_code = parts[i + 1]
                break

        if not cp_code:
            return "Unknown"

        # Look up pack's color pack config
        pack_id = pack_info.get("id", "")
        pack_cp_config = self.color_pack.get(pack_id, {})

        # Find which option matches this CP code
        for option in pack_cp_config.get("options", []):
            file_patterns = option.get("filePatterns", [])
            for pattern in file_patterns:
                if f"CP_{cp_code}" == pattern or cp_code in pattern:
                    return option.get("folder", "Unknown")

        return "Unknown"
    
    def _build_tree(self, path_parts: List[str]) -> str:
        """
        Build a tree-style representation of the path.
        
        Args:
            path_parts: List of path segments
        
        Returns:
            Tree string representation
        """
        if not path_parts:
            return ""
        
        lines = []
        
        # First line (root)
        lines.append(path_parts[0])
        
        # Subsequent lines with tree characters
        for i, part in enumerate(path_parts[1:], 1):
            # Calculate indentation
            indent = "    " * (i - 1)
            
            # Use └── for last item at each level, but we're showing linear path
            # so always use └──
            lines.append(f"{indent}└── {part}")
        
        return "\n".join(lines)


def resolve_path(
    path_template: List[str],
    pack_info: Dict[str, Any],
    model_info: Optional[Dict[str, Any]],
    config: Dict[str, Any],
    filename: str = ""
) -> Dict[str, Any]:
    """
    Convenience function to resolve path.

    Args:
        path_template: List of path segments with placeholders
        pack_info: Pack information
        model_info: Optional model information
        config: Full configuration object
        filename: Original filename (for CP code extraction)

    Returns:
        Dict with resolved path information
    """
    resolver = PathResolver(config)
    return resolver.resolve(path_template, pack_info, model_info, filename)
