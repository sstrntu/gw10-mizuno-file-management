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
        self.pack_structure = config.get("packStructure", {})
        self.color_pack = config.get("colorPack", {})
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
        Generate directory structure for a single pack using pack_structure.json.

        Args:
            pack: Pack configuration

        Returns:
            Dict representing pack directory structure
        """
        pack_id = pack.get("id", "")
        pack_folder = pack.get("folder", "")
        categories = self.folders.get("categories", {})

        pack_node = {
            "name": pack_folder,
            "type": "directory",
            "children": []
        }

        # Get pack-specific structure
        pack_models = self.pack_structure.get(pack_id, {})
        pack_color_pack = self.color_pack.get(pack_id, {})

        # Helper to get model folder name by code
        def get_model_folder(model_code: str) -> str:
            for model in self.models:
                if model.get("code") == model_code:
                    return model.get("folder", "")
            return ""

        # 1. Key Visual
        if "keyVisual" in categories:
            kv_node = {
                "name": categories["keyVisual"],
                "type": "directory",
                "children": []
            }

            # Add model folders (only models in this pack's keyVisual)
            kv_models = pack_models.get("keyVisual", [])
            for model_code in kv_models:
                model_folder = get_model_folder(model_code)
                if model_folder:
                    model_node = {
                        "name": model_folder,
                        "type": "directory",
                        "children": [
                            {"name": "PSD", "type": "directory"}
                        ]
                    }
                    kv_node["children"].append(model_node)

            # Add Color Pack folder with options
            if pack.get("hasColorPack", False):
                color_pack_node = {
                    "name": "Color Pack",
                    "type": "directory",
                    "children": []
                }

                # Add Color Pack options
                for option in pack_color_pack.get("options", []):
                    color_pack_node["children"].append({
                        "name": option.get("folder", ""),
                        "type": "directory"
                    })

                kv_node["children"].append(color_pack_node)

            pack_node["children"].append(kv_node)

        # 2. Tech Shots (skip for SALA)
        if "techShots" in categories and not pack.get("colorPackOnly", False):
            tech_node = {
                "name": categories["techShots"],
                "type": "directory",
                "children": []
            }

            # Add model folders (only models in this pack's techShots)
            tech_models = pack_models.get("techShots", [])
            for model_code in tech_models:
                model_folder = get_model_folder(model_code)
                if model_folder:
                    tech_node["children"].append({
                        "name": model_folder,
                        "type": "directory"
                    })

            pack_node["children"].append(tech_node)

        # 3. Supporting Images (skip for SALA)
        if "supporting" in categories and not pack.get("colorPackOnly", False):
            support_node = {
                "name": categories["supporting"],
                "type": "directory",
                "children": []
            }

            # Add model folders (only models in this pack's supporting)
            supporting_models = pack_models.get("supporting", [])
            for model_code in supporting_models:
                model_folder = get_model_folder(model_code)
                if model_folder:
                    support_node["children"].append({
                        "name": model_folder,
                        "type": "directory"
                    })

            pack_node["children"].append(support_node)

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
