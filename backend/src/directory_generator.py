"""
Directory Structure Generator
Generates complete directory structure from config files.
"""

import sys
from pathlib import Path
from typing import Dict, Any, List

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.config_loader import load_config


class DirectoryStructureGenerator:
    def __init__(self, config: Dict[str, Any]):
        """
        Initialize the directory structure generator.
        
        Args:
            config: Full configuration object
        """
        self.config = config
        self.packs = config.get("packs", [])
        self.models = config.get("models", [])
        self.folders = config.get("folders", {})
        self.root_folder = config.get("drive", {}).get("rootFolder", "")
    
    def generate_structure(self) -> Dict[str, Any]:
        """
        Generate complete directory structure.
        
        Returns:
            Dict with hierarchical structure
        """
        structure = {
            "name": self.root_folder,
            "type": "directory",
            "children": []
        }
        
        # Generate structure for each pack
        for pack in self.packs:
            pack_node = self._generate_pack_structure(pack)
            structure["children"].append(pack_node)
        
        return structure
    
    def _generate_pack_structure(self, pack: Dict[str, Any]) -> Dict[str, Any]:
        """
        Generate directory structure for a single pack.
        
        Args:
            pack: Pack configuration
        
        Returns:
            Dict representing pack directory structure
        """
        pack_folder = pack.get("folder", "")
        categories = self.folders.get("categories", {})
        kv_subfolders = self.folders.get("kvSubfolders", {})
        
        pack_node = {
            "name": pack_folder,
            "type": "directory",
            "children": []
        }
        
        # 1. Key Visual
        if "keyVisual" in categories:
            kv_node = {
                "name": categories["keyVisual"],
                "type": "directory",
                "children": []
            }
            
            # Add KV subfolders
            if "colorPack" in kv_subfolders:
                kv_node["children"].append({
                    "name": kv_subfolders["colorPack"],
                    "type": "directory"
                })
            
            if "psd" in kv_subfolders:
                kv_node["children"].append({
                    "name": kv_subfolders["psd"],
                    "type": "directory"
                })
            
            # Add model folders
            for model in self.models:
                kv_node["children"].append({
                    "name": model.get("folder", ""),
                    "type": "directory"
                })
            
            pack_node["children"].append(kv_node)
        
        # 2. Tech Shots
        if "techShots" in categories:
            tech_node = {
                "name": categories["techShots"],
                "type": "directory",
                "children": []
            }
            
            # Add model folders
            for model in self.models:
                tech_node["children"].append({
                    "name": model.get("folder", ""),
                    "type": "directory"
                })
            
            pack_node["children"].append(tech_node)
        
        # 3. Supporting Images
        if "supporting" in categories:
            support_node = {
                "name": categories["supporting"],
                "type": "directory",
                "children": []
            }
            
            # Add model folders
            for model in self.models:
                support_node["children"].append({
                    "name": model.get("folder", ""),
                    "type": "directory"
                })
            
            pack_node["children"].append(support_node)
        
        # 4. Carousel
        if "carousel" in categories:
            carousel_node = {
                "name": categories["carousel"],
                "type": "directory"
            }
            
            pack_node["children"].append(carousel_node)
        
        return pack_node
    
    def generate_flat_paths(self) -> List[str]:
        """
        Generate flat list of all directory paths.
        Excludes the root folder itself, only returns paths for its children.

        Returns:
            List of full directory paths (relative to root folder)
        """
        paths = []
        structure = self.generate_structure()

        def traverse(node: Dict[str, Any], current_path: str = ""):
            path = f"{current_path}/{node['name']}" if current_path else node['name']

            if node.get("type") == "directory":
                paths.append(path)

            for child in node.get("children", []):
                traverse(child, path)

        # Traverse from root's children, skipping the root folder itself
        for child in structure.get("children", []):
            traverse(child, "")

        return paths


def generate_directory_structure(config_dir: str = None) -> Dict[str, Any]:
    """
    Convenience function to generate directory structure.
    
    Args:
        config_dir: Path to config directory (optional)
    
    Returns:
        Dict with hierarchical structure
    """
    config = load_config(config_dir)
    generator = DirectoryStructureGenerator(config)
    return generator.generate_structure()


def generate_flat_paths(config_dir: str = None) -> List[str]:
    """
    Convenience function to generate flat list of paths.
    
    Args:
        config_dir: Path to config directory (optional)
    
    Returns:
        List of full directory paths
    """
    config = load_config(config_dir)
    generator = DirectoryStructureGenerator(config)
    return generator.generate_flat_paths()
