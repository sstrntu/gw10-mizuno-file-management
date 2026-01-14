"""
Config Loader Module
Loads and merges all configuration files into a single in-memory object.
"""

import json
import os
from pathlib import Path
from typing import Dict, Any


class ConfigLoader:
    def __init__(self, config_dir: str = None):
        """
        Initialize the config loader.
        
        Args:
            config_dir: Path to the config directory. Defaults to ../config relative to this file.
        """
        if config_dir is None:
            # Default to ../../config relative to this file (project root config)
            # In Docker: /app/src -> /app -> /app/config
            # In local dev: backend/src -> backend -> project_root -> config
            current_dir = Path(__file__).parent.parent
            if (current_dir / "config").exists():
                # Docker environment: config is at /app/config
                config_dir = current_dir / "config"
            else:
                # Local development: config is at project_root/config
                config_dir = current_dir.parent / "config"
        
        self.config_dir = Path(config_dir)
        self.config = None
    
    def load(self) -> Dict[str, Any]:
        """
        Load all configuration files and merge them into a single object.
        
        Returns:
            Dict containing all configuration data
        
        Raises:
            FileNotFoundError: If config files are missing
            json.JSONDecodeError: If config files contain invalid JSON
        """
        # Load main config.json
        config_path = self.config_dir / "config.json"
        if not config_path.exists():
            raise FileNotFoundError(f"Config file not found: {config_path}")
        
        with open(config_path, 'r', encoding='utf-8') as f:
            main_config = json.load(f)
        
        # Initialize merged config
        self.config = {
            "version": main_config.get("version"),
            "drive": main_config.get("drive", {}),
            "packs": [],
            "models": [],
            "folders": {},
            "rules": {}
        }
        
        # Load referenced config files
        includes = main_config.get("includes", {})
        
        # Load packs
        if "packs" in includes:
            packs_path = self.config_dir / includes["packs"]
            with open(packs_path, 'r', encoding='utf-8') as f:
                packs_data = json.load(f)
                self.config["packs"] = packs_data.get("packs", [])
        
        # Load models
        if "models" in includes:
            models_path = self.config_dir / includes["models"]
            with open(models_path, 'r', encoding='utf-8') as f:
                models_data = json.load(f)
                self.config["models"] = models_data.get("models", [])
        
        # Load folders
        if "folders" in includes:
            folders_path = self.config_dir / includes["folders"]
            with open(folders_path, 'r', encoding='utf-8') as f:
                self.config["folders"] = json.load(f)
        
        # Load rules
        if "rules" in includes:
            rules_path = self.config_dir / includes["rules"]
            with open(rules_path, 'r', encoding='utf-8') as f:
                rules_data = json.load(f)
                self.config["rules"] = {
                    "allowedExtensions": rules_data.get("allowedExtensions", []),
                    "rules": rules_data.get("rules", [])
                }
        
        return self.config
    
    def get_config(self) -> Dict[str, Any]:
        """
        Get the loaded configuration.
        
        Returns:
            Dict containing all configuration data
        
        Raises:
            RuntimeError: If config hasn't been loaded yet
        """
        if self.config is None:
            raise RuntimeError("Configuration not loaded. Call load() first.")
        return self.config


# Convenience function for quick loading
def load_config(config_dir: str = None) -> Dict[str, Any]:
    """
    Load configuration files.
    
    Args:
        config_dir: Path to the config directory
    
    Returns:
        Dict containing all configuration data
    """
    loader = ConfigLoader(config_dir)
    return loader.load()
