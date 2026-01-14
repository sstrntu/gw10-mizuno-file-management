"""
Rule Matcher Module
Matches filenames against routing rules to determine the correct folder path.
"""

import re
from typing import Dict, Any, Optional, List


class RuleMatchError(Exception):
    """Base exception for rule matching errors."""
    pass


class RuleNotFoundError(RuleMatchError):
    """Raised when no rule matches the filename."""
    pass


class RuleAmbiguousError(RuleMatchError):
    """Raised when multiple rules match the filename."""
    pass


class ModelCodeRequiredError(RuleMatchError):
    """Raised when a rule requires a model code but none was found."""
    pass


class RuleMatcher:
    def __init__(self, rules: List[Dict[str, Any]]):
        """
        Initialize the rule matcher.
        
        Args:
            rules: List of rule configurations from config
        """
        self.rules = rules
    
    def match(self, filename: str, model_info: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Match filename against rules (first match wins).
        
        Args:
            filename: The filename to analyze
            model_info: Optional model information from model detector
        
        Returns:
            Dict containing the matched rule
        
        Raises:
            RuleNotFoundError: If no rule matches
            RuleAmbiguousError: If multiple rules match (config error)
            ModelCodeRequiredError: If rule requires model but none found
        """
        matched_rules = []
        
        for rule in self.rules:
            if self._check_rule(filename, rule, model_info):
                matched_rules.append(rule)
                # First match wins - stop checking
                break
        
        # Handle results
        if len(matched_rules) == 0:
            raise RuleNotFoundError(
                f"No matching rule found for filename: {filename}"
            )
        
        # Note: We break on first match, so this shouldn't happen
        # But keeping it for safety in case logic changes
        if len(matched_rules) > 1:
            rule_ids = [r.get("id") for r in matched_rules]
            raise RuleAmbiguousError(
                f"Multiple rules match filename: {filename}. "
                f"Matched rules: {', '.join(rule_ids)}"
            )
        
        return matched_rules[0]
    
    def _check_rule(self, filename: str, rule: Dict[str, Any], model_info: Optional[Dict[str, Any]]) -> bool:
        """
        Check if a single rule matches the filename.
        
        Args:
            filename: The filename to check
            rule: The rule configuration
            model_info: Optional model information
        
        Returns:
            True if rule matches, False otherwise
        
        Raises:
            ModelCodeRequiredError: If rule requires model but none found
        """
        match_config = rule.get("match", {})
        
        # Check extensions first
        if "extensions" in match_config:
            allowed_extensions = match_config["extensions"]
            file_ext = self._get_extension(filename)
            if file_ext not in allowed_extensions:
                return False
        
        # Check contains (all must match)
        if "contains" in match_config:
            contains_list = match_config["contains"]
            filename_lower = filename.lower()
            for substring in contains_list:
                if substring.lower() not in filename_lower:
                    return False
        
        # Check codeRange
        if "codeRange" in match_config:
            if not self._check_code_range(filename, match_config["codeRange"]):
                return False
        
        # Check anyOf (at least one must match)
        if "anyOf" in match_config:
            any_of_list = match_config["anyOf"]
            any_match = False
            
            for condition in any_of_list:
                # Check contains within anyOf
                if "contains" in condition:
                    contains_list = condition["contains"]
                    filename_lower = filename.lower()
                    all_match = all(substring.lower() in filename_lower for substring in contains_list)
                    if all_match:
                        any_match = True
                        break
                
                # Check codeRange within anyOf
                if "codeRange" in condition:
                    if self._check_code_range(filename, condition["codeRange"]):
                        any_match = True
                        break
            
            if not any_match:
                return False
        
        # All other checks passed - now check if model code is required
        if match_config.get("requiresModelCode", False):
            if model_info is None:
                raise ModelCodeRequiredError(
                    f"Rule '{rule.get('id')}' requires a model code, but none was found in filename: {filename}"
                )
        
        # All checks passed
        return True
    
    def _check_code_range(self, filename: str, code_range: Dict[str, Any]) -> bool:
        """
        Check if filename contains a code within the specified range.
        
        Example: prefix="T", min=1, max=5, pad=2 matches T01, T02, T03, T04, T05
        
        Args:
            filename: The filename to check
            code_range: Dict with prefix, min, max, pad
        
        Returns:
            True if a valid code is found, False otherwise
        """
        prefix = code_range.get("prefix", "")
        min_val = code_range.get("min", 1)
        max_val = code_range.get("max", 99)
        pad = code_range.get("pad", 2)
        
        # Build regex pattern to find codes like T01, T02, etc.
        # Pattern: prefix followed by padded number
        pattern = rf"{re.escape(prefix)}(\d{{{pad}}})"
        
        matches = re.findall(pattern, filename, re.IGNORECASE)
        
        for match in matches:
            try:
                num = int(match)
                if min_val <= num <= max_val:
                    return True
            except ValueError:
                continue
        
        return False
    
    def _get_extension(self, filename: str) -> str:
        """
        Get file extension (including the dot).
        
        Args:
            filename: The filename
        
        Returns:
            Extension string (e.g., ".jpg", ".psd")
        """
        if '.' not in filename:
            return ""
        
        parts = filename.rsplit('.', 1)
        return f".{parts[1].lower()}"


def match_rule(filename: str, rules: List[Dict[str, Any]], model_info: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Convenience function to match a rule.
    
    Args:
        filename: The filename to analyze
        rules: List of rule configurations
        model_info: Optional model information
    
    Returns:
        Dict containing the matched rule
    """
    matcher = RuleMatcher(rules)
    return matcher.match(filename, model_info)
