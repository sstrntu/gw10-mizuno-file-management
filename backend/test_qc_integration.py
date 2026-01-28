#!/usr/bin/env python3
"""
Test script to verify QC Supabase integration
Tests the custom Supabase client with the QC operations
"""

import os
import sys
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Add src to path
sys.path.insert(0, str(Path(__file__).parent))

from src.supabase_client import get_supabase_client

print("=" * 60)
print("QC SUPABASE INTEGRATION TEST")
print("=" * 60)

# Test 1: Get Supabase client
print("\n1️⃣ Testing Supabase client initialization...")
try:
    supabase = get_supabase_client()
    print("✅ Successfully initialized Supabase client")
except Exception as e:
    print(f"❌ Failed to initialize client: {e}")
    sys.exit(1)

# Test 2: Check if QC table exists by reading
print("\n2️⃣ Testing SELECT from mz_27ss_upload_qc...")
try:
    response = supabase.table('mz_27ss_upload_qc').select('*').limit(1).execute()
    print(f"✅ Successfully queried mz_27ss_upload_qc")
    print(f"   Records found: {len(response.data)}")
    if response.data:
        print(f"   Sample record keys: {list(response.data[0].keys())}")
except Exception as e:
    print(f"❌ Failed to query mz_27ss_upload_qc: {e}")
    sys.exit(1)

# Test 3: Check if actions table exists
print("\n3️⃣ Testing SELECT from mz_27ss_upload_qc_actions...")
try:
    response = supabase.table('mz_27ss_upload_qc_actions').select('*').limit(1).execute()
    print(f"✅ Successfully queried mz_27ss_upload_qc_actions")
    print(f"   Records found: {len(response.data)}")
    if response.data:
        print(f"   Sample record keys: {list(response.data[0].keys())}")
except Exception as e:
    print(f"❌ Failed to query mz_27ss_upload_qc_actions: {e}")
    sys.exit(1)

# Test 4: Insert a test QC record
print("\n4️⃣ Testing INSERT into mz_27ss_upload_qc...")
try:
    test_file_id = f"test-file-{os.urandom(4).hex()}"
    test_record = {
        'file_id': test_file_id,
        'filename': f'test_{test_file_id}.jpg',
        'web_view_link': 'https://drive.google.com/file/d/test/view',
        'mime_type': 'image/jpeg',
        'status': 'Pending',
        'approval_count': 0
    }

    response = supabase.table('mz_27ss_upload_qc').insert(test_record).execute()
    print(f"✅ Successfully inserted test record")
    print(f"   File ID: {test_file_id}")

    # Get the ID of the inserted record
    get_response = supabase.table('mz_27ss_upload_qc').select('id').eq('file_id', test_file_id).execute()
    if get_response.data:
        test_qc_id = get_response.data[0]['id']
        print(f"   QC Record ID: {test_qc_id}")
    else:
        print(f"❌ Could not retrieve inserted record")
        sys.exit(1)

except Exception as e:
    print(f"❌ Failed to insert record: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

# Test 5: Update the QC record
print("\n5️⃣ Testing UPDATE on mz_27ss_upload_qc...")
try:
    update_response = supabase.table('mz_27ss_upload_qc').update({
        'approval_count': 1,
        'status': 'Pending'
    }).eq('id', test_qc_id).execute()
    print(f"✅ Successfully updated record")
    print(f"   New approval count: 1")
    print(f"   Status updated successfully")
except Exception as e:
    print(f"❌ Failed to update record: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

# Test 6: Insert an action record
print("\n6️⃣ Testing INSERT into mz_27ss_upload_qc_actions...")
try:
    action_record = {
        'file_id': test_qc_id,
        'action_type': 'approve',
        'user_id': 'test-user-123',
        'user_email': 'test@example.com',
        'comment': 'Test approval'
    }

    supabase.table('mz_27ss_upload_qc_actions').insert(action_record).execute()
    print(f"✅ Successfully inserted action record")
    print(f"   Action type: approve")
    print(f"   User: test@example.com")
except Exception as e:
    print(f"❌ Failed to insert action: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

# Test 7: Query actions with filter and order
print("\n7️⃣ Testing SELECT actions with filtering...")
try:
    actions_response = supabase.table('mz_27ss_upload_qc_actions').select('*').eq('file_id', test_qc_id).order('created_at', ascending=True).execute()
    print(f"✅ Successfully queried actions")
    print(f"   Actions found: {len(actions_response.data)}")
    for action in actions_response.data:
        print(f"   - {action['action_type']} by {action['user_email']} at {action['created_at']}")
except Exception as e:
    print(f"❌ Failed to query actions: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

# Test 8: Delete test records
print("\n8️⃣ Testing DELETE operations...")
try:
    # Delete actions first (due to potential foreign key)
    supabase.table('mz_27ss_upload_qc_actions').delete().eq('file_id', test_qc_id).execute()
    print(f"✅ Deleted test actions")

    # Delete main record
    supabase.table('mz_27ss_upload_qc').delete().eq('id', test_qc_id).execute()
    print(f"✅ Deleted test record")
except Exception as e:
    print(f"❌ Failed to delete: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

# Final summary
print("\n" + "=" * 60)
print("✅ ALL QC TESTS PASSED!")
print("=" * 60)
print("\nSummary:")
print("✓ Supabase client initialized successfully")
print("✓ Successfully read from mz_27ss_upload_qc")
print("✓ Successfully read from mz_27ss_upload_qc_actions")
print("✓ Successfully inserted QC record")
print("✓ Successfully updated QC record")
print("✓ Successfully inserted action record")
print("✓ Successfully queried actions with filtering and ordering")
print("✓ Successfully deleted records")
print("\n🎉 QC Supabase integration is fully functional!")
print("=" * 60)
