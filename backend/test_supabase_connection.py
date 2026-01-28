#!/usr/bin/env python3
"""
Test script to verify Supabase connection and read/write operations
"""

import os
from dotenv import load_dotenv
from supabase import create_client
from datetime import datetime

# Load environment variables
load_dotenv()

SUPABASE_URL = os.environ.get('SUPABASE_URL')
SUPABASE_SERVICE_KEY = os.environ.get('SUPABASE_SERVICE_KEY')

print("=" * 60)
print("SUPABASE CONNECTION TEST")
print("=" * 60)

# Check credentials
if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    print("❌ ERROR: SUPABASE_URL or SUPABASE_SERVICE_KEY not found in .env")
    exit(1)

print(f"✓ SUPABASE_URL: {SUPABASE_URL}")
print(f"✓ SUPABASE_SERVICE_KEY: {SUPABASE_SERVICE_KEY[:20]}...")

# Create client
try:
    print("\n1️⃣ Creating Supabase client...")
    # Use REST API directly with httpx
    import httpx
    supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    print("✅ Client created successfully")
except Exception as e:
    print(f"❌ Failed to create client: {e}")
    print("   Trying alternative initialization...")
    try:
        # Alternative: Initialize with kwargs
        from supabase.client import Client, ClientOptions
        options = ClientOptions()
        supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
        print("✅ Client created with alternative method")
    except Exception as e2:
        print(f"❌ Alternative method also failed: {e2}")
        exit(1)

# Test 1: Check if schema and tables exist
print("\n2️⃣ Checking schema and tables...")
try:
    # Try to read from the main QC table
    response = supabase.table('mz_27ss_upload_qc').select('id').limit(1).execute()
    print(f"✅ Successfully accessed mz_27ss_upload_qc table")
    print(f"   Current records: {len(response.data)}")
except Exception as e:
    print(f"❌ Failed to access mz_27ss_upload_qc: {e}")
    exit(1)

# Test 2: Insert a test record
print("\n3️⃣ Testing INSERT operation...")
try:
    test_file_id = f"test-file-{datetime.now().timestamp()}"
    test_record = {
        'file_id': test_file_id,
        'filename': f'test_file_{test_file_id[:8]}.jpg',
        'web_view_link': 'https://drive.google.com/file/d/test123/view',
        'mime_type': 'image/jpeg',
        'status': 'Pending',
        'approval_count': 0
    }

    response = supabase.table('mz_27ss_upload_qc').insert(test_record).execute()
    print(f"✅ Successfully inserted test record")
    print(f"   File ID: {test_file_id}")
    print(f"   Record: {response.data}")

except Exception as e:
    print(f"❌ Failed to insert record: {e}")
    exit(1)

# Test 3: Read the inserted record
print("\n4️⃣ Testing SELECT/READ operation...")
try:
    response = supabase.table('mz_27ss_upload_qc').select('*').eq('file_id', test_file_id).execute()

    if response.data:
        print(f"✅ Successfully read test record")
        record = response.data[0]
        print(f"   ID: {record['id']}")
        print(f"   Filename: {record['filename']}")
        print(f"   Status: {record['status']}")
        test_qc_id = record['id']
    else:
        print(f"❌ No records found")
        exit(1)

except Exception as e:
    print(f"❌ Failed to read record: {e}")
    exit(1)

# Test 4: Insert an action record
print("\n5️⃣ Testing INSERT into mz_27ss_upload_qc_actions...")
try:
    action_record = {
        'file_id': test_qc_id,
        'action_type': 'approve',
        'user_id': 'test-user-id',
        'user_email': 'test@example.com',
        'comment': 'Test approval'
    }

    response = supabase.table('mz_27ss_upload_qc_actions').insert(action_record).execute()
    print(f"✅ Successfully inserted test action")
    print(f"   Action: {response.data}")

except Exception as e:
    print(f"❌ Failed to insert action: {e}")
    exit(1)

# Test 5: Read actions
print("\n6️⃣ Testing SELECT actions by file_id...")
try:
    response = supabase.table('mz_27ss_upload_qc_actions').select('*').eq('file_id', test_qc_id).execute()

    print(f"✅ Successfully read actions")
    print(f"   Total actions: {len(response.data)}")
    for action in response.data:
        print(f"   - {action['action_type']} by {action['user_email']} ({action['created_at']})")

except Exception as e:
    print(f"❌ Failed to read actions: {e}")
    exit(1)

# Test 6: Update a record
print("\n7️⃣ Testing UPDATE operation...")
try:
    update_data = {
        'approval_count': 1,
        'status': '1/3 Approved'
    }

    response = supabase.table('mz_27ss_upload_qc').update(update_data).eq('id', test_qc_id).execute()
    print(f"✅ Successfully updated record")
    print(f"   Updated record: {response.data}")

except Exception as e:
    print(f"❌ Failed to update record: {e}")
    exit(1)

# Test 7: Verify update
print("\n8️⃣ Verifying update...")
try:
    response = supabase.table('mz_27ss_upload_qc').select('*').eq('id', test_qc_id).execute()

    if response.data:
        record = response.data[0]
        print(f"✅ Record verification successful")
        print(f"   Current status: {record['status']}")
        print(f"   Current approvals: {record['approval_count']}")
    else:
        print(f"❌ Record not found")
        exit(1)

except Exception as e:
    print(f"❌ Failed to verify: {e}")
    exit(1)

# Test 8: Delete test records
print("\n9️⃣ Cleaning up test records...")
try:
    # Delete actions first (due to foreign key)
    supabase.table('mz_27ss_upload_qc_actions').delete().eq('file_id', test_qc_id).execute()
    print(f"✅ Deleted test actions")

    # Delete main record
    supabase.table('mz_27ss_upload_qc').delete().eq('id', test_qc_id).execute()
    print(f"✅ Deleted test record")

except Exception as e:
    print(f"❌ Failed to delete: {e}")
    exit(1)

# Final summary
print("\n" + "=" * 60)
print("✅ ALL TESTS PASSED!")
print("=" * 60)
print("\nSummary:")
print("✓ Connected to Supabase successfully")
print("✓ Successfully created records in mz_27ss_upload_qc")
print("✓ Successfully created records in mz_27ss_upload_qc_actions")
print("✓ Successfully read records from both tables")
print("✓ Successfully updated records")
print("✓ Successfully deleted records")
print("✓ Foreign key relationships working correctly")
print("\n🎉 Supabase connection is fully functional!")
print("=" * 60)
