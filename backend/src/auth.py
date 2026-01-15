"""
Supabase Authentication Module
Handles authentication via Supabase with Google OAuth provider.
"""

import os
import jwt
from typing import Optional, Dict, Any
from functools import wraps
from flask import request, jsonify

from google.oauth2.credentials import Credentials

# Supabase configuration
SUPABASE_URL = os.environ.get('SUPABASE_URL')
SUPABASE_ANON_KEY = os.environ.get('SUPABASE_ANON_KEY')
SUPABASE_JWT_SECRET = os.environ.get('SUPABASE_JWT_SECRET')


def get_token_from_header() -> Optional[str]:
    """
    Extract Bearer token from Authorization header.

    Returns:
        Token string or None
    """
    auth_header = request.headers.get('Authorization', '')
    if auth_header.startswith('Bearer '):
        return auth_header[7:]
    return None


def verify_supabase_token(token: str) -> Optional[Dict[str, Any]]:
    """
    Verify a Supabase JWT token.

    Args:
        token: JWT token from Supabase

    Returns:
        Decoded token payload or None if invalid
    """
    if not SUPABASE_JWT_SECRET:
        print("Warning: SUPABASE_JWT_SECRET not set, skipping verification")
        # In development, decode without verification
        try:
            return jwt.decode(token, options={"verify_signature": False})
        except Exception:
            return None

    try:
        # Verify with Supabase JWT secret
        payload = jwt.decode(
            token,
            SUPABASE_JWT_SECRET,
            algorithms=['HS256'],
            audience='authenticated'
        )
        return payload
    except jwt.ExpiredSignatureError:
        print("Token expired")
        return None
    except jwt.InvalidTokenError as e:
        print(f"Invalid token: {e}")
        return None


def get_current_user() -> Optional[Dict[str, Any]]:
    """
    Get current user from request Authorization header.

    Returns:
        User info dict or None if not authenticated
    """
    token = get_token_from_header()
    if not token:
        return None

    payload = verify_supabase_token(token)
    if not payload:
        return None

    return {
        'id': payload.get('sub'),
        'email': payload.get('email'),
        'role': payload.get('role'),
        'app_metadata': payload.get('app_metadata', {}),
        'user_metadata': payload.get('user_metadata', {})
    }


def get_google_credentials_from_token(provider_token: str) -> Optional[Credentials]:
    """
    Create Google credentials from Supabase provider token.

    The provider_token is the Google access token that Supabase stores
    after Google OAuth login.

    Args:
        provider_token: Google access token from Supabase session

    Returns:
        Google Credentials object or None
    """
    if not provider_token:
        return None

    try:
        # Create credentials with the access token
        credentials = Credentials(token=provider_token)
        return credentials
    except Exception as e:
        print(f"Error creating Google credentials: {e}")
        return None


def require_auth(f):
    """
    Decorator to require authentication for an endpoint.
    """
    @wraps(f)
    def decorated(*args, **kwargs):
        user = get_current_user()
        if not user:
            return jsonify({
                'success': False,
                'error': 'Authentication required',
                'error_type': 'AUTH_REQUIRED'
            }), 401

        # Add user to request context
        request.current_user = user
        return f(*args, **kwargs)

    return decorated


def get_auth_status_from_token(token: str) -> Dict[str, Any]:
    """
    Get authentication status from a token.

    Args:
        token: Supabase JWT token

    Returns:
        Dict with authentication status
    """
    if not token:
        return {
            'authenticated': False,
            'message': 'No token provided'
        }

    payload = verify_supabase_token(token)
    if not payload:
        return {
            'authenticated': False,
            'message': 'Invalid or expired token'
        }

    return {
        'authenticated': True,
        'user': {
            'id': payload.get('sub'),
            'email': payload.get('email'),
            'role': payload.get('role')
        },
        'message': 'Authenticated'
    }
