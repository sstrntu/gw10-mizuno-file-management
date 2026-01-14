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
        self.root_folder = config.get("drive", {}).get("rootFolder", "")
    
    def resolve(
        self, 
        path_template: List[str], 
        pack_info: Dict[str, Any], 
        model_info: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Resolve placeholders in path template.
        
        Args:
            path_template: List of path segments with placeholders
            pack_info: Pack information
            model_info: Optional model information
        
        Returns:
            Dict with:
                - path_parts: List of resolved path segments
                - path_string: Full path as string
                - tree_string: Pretty tree representation
        """
        resolved_parts = []
        
        for segment in path_template:
            resolved_segment = self._resolve_placeholder(segment, pack_info, model_info)
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
        model_info: Optional[Dict[str, Any]]
    ) -> str:
        """
        Resolve a single placeholder.
        
        Args:
            placeholder: The placeholder string (e.g., "{PACK_FOLDER}")
            pack_info: Pack information
            model_info: Optional model information
        
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
    config: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Convenience function to resolve path.
    
    Args:
        path_template: List of path segments with placeholders
        pack_info: Pack information
        model_info: Optional model information
        config: Full configuration object
    
    Returns:
        Dict with resolved path information
    """
    resolver = PathResolver(config)
    return resolver.resolve(path_template, pack_info, model_info)
