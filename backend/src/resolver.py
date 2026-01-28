"""
Main Resolver Module
Orchestrates the entire filename resolution process.
"""

from typing import Dict, Any, Optional
from .config_loader import load_config
from .pack_detector import detect_pack, PackDetectionError
from .model_detector import detect_model
from .rule_matcher import match_rule, RuleMatchError
from .path_resolver import resolve_path


class ResolverResult:
    """Container for resolution results."""
    
    def __init__(
        self,
        success: bool,
        filename: str,
        pack_info: Optional[Dict[str, Any]] = None,
        model_info: Optional[Dict[str, Any]] = None,
        rule_info: Optional[Dict[str, Any]] = None,
        path_info: Optional[Dict[str, Any]] = None,
        error: Optional[str] = None,
        error_type: Optional[str] = None
    ):
        self.success = success
        self.filename = filename
        self.pack_info = pack_info
        self.model_info = model_info
        self.rule_info = rule_info
        self.path_info = path_info
        self.error = error
        self.error_type = error_type
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        result = {
            "success": self.success,
            "filename": self.filename
        }
        
        if self.success:
            result["pack"] = {
                "id": self.pack_info.get("id") if self.pack_info else None,
                "folder": self.pack_info.get("folder") if self.pack_info else None
            }
            
            result["model"] = {
                "code": self.model_info.get("code") if self.model_info else None,
                "folder": self.model_info.get("folder") if self.model_info else None
            } if self.model_info else None
            
            result["rule"] = {
                "id": self.rule_info.get("id") if self.rule_info else None,
                "description": self.rule_info.get("description") if self.rule_info else None
            }
            
            result["path"] = self.path_info
        else:
            result["error"] = self.error
            result["error_type"] = self.error_type
        
        return result


class FilenameResolver:
    def __init__(self, config_dir: str = None):
        """
        Initialize the filename resolver.
        
        Args:
            config_dir: Path to config directory (optional)
        """
        self.config = load_config(config_dir)
    
    def resolve(self, filename: str) -> ResolverResult:
        """
        Resolve a filename to its folder path.
        
        Args:
            filename: The filename to resolve
        
        Returns:
            ResolverResult object
        """
        try:
            # Step 1: Detect pack
            pack_info = detect_pack(filename, self.config["packs"])
            
            # Step 2: Detect model (optional)
            model_info = detect_model(filename, self.config["models"])
            
            # Step 3: Match rule
            rule_info = match_rule(
                filename, 
                self.config["rules"]["rules"], 
                model_info
            )
            
            # Step 4: Resolve path
            path_template = rule_info.get("pathTemplate", [])
            path_info = resolve_path(
                path_template,
                pack_info,
                model_info,
                self.config,
                filename
            )
            
            return ResolverResult(
                success=True,
                filename=filename,
                pack_info=pack_info,
                model_info=model_info,
                rule_info=rule_info,
                path_info=path_info
            )
        
        except PackDetectionError as e:
            return ResolverResult(
                success=False,
                filename=filename,
                error=str(e),
                error_type="PACK_ERROR"
            )
        
        except RuleMatchError as e:
            return ResolverResult(
                success=False,
                filename=filename,
                error=str(e),
                error_type="RULE_ERROR"
            )
        
        except Exception as e:
            return ResolverResult(
                success=False,
                filename=filename,
                error=f"Unexpected error: {str(e)}",
                error_type="UNKNOWN_ERROR"
            )


def resolve_filename(filename: str, config_dir: str = None) -> ResolverResult:
    """
    Convenience function to resolve a filename.
    
    Args:
        filename: The filename to resolve
        config_dir: Path to config directory (optional)
    
    Returns:
        ResolverResult object
    """
    resolver = FilenameResolver(config_dir)
    return resolver.resolve(filename)
