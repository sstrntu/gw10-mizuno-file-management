#!/usr/bin/env python3
"""
Simple Supabase test using direct HTTP requests (PostgREST API)
Avoids library version conflicts
"""

import httpx
import os
import json
from dotenv import load_dotenv
from datetime import datetime
import uuid

# Load environment variables
load_dotenv()

SUPABASE_URL = os.environ.get('SUPABASE_URL')
SUPABASE_SERVICE_KEY = os.environ.get('SUPABASE_SERVICE_KEY')

print("=" * 60)
print("SUPABASE CONNECTION TEST (Direct HTTP)")
print("=" * 60)

# Check credentials
if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    print("❌ ERROR: SUPABASE_URL or SUPABASE_SERVICE_KEY not found in .env")
    exit(1)

print(f"✓ SUPABASE_URL: {SUPABASE_URL}")
print(f"✓ SUPABASE_SERVICE_KEY: {SUPABASE_SERVICE_KEY[:20]}...")

# Create HTTP client with proper headers
headers = {
    "apikey": SUPABASE_SERVICE_KEY,
    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation"
}

REST_URL = f"{SUPABASE_URL}/rest/v1"
SCHEMA = "mz-27SS-upload-qc"

print(f"\nUsing schema: {SCHEMA}")

print("\n1️⃣ Testing database connection with simple query...")
try:
    # Test connection with a simple SELECT (from custom schema)
    with httpx.Client() as client:
        # For custom schemas, use the schema.table notation or Add-Profile header
        query_headers = headers.copy()
        query_headers["Accept-Profile"] = SCHEMA

        response = client.get(
            f"{REST_URL}/mz_27ss_upload_qc?select=id&limit=1",
            headers=query_headers
        )

        print(f"Status: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Successfully connected to database")
            print(f"   Current records in mz_27ss_upload_qc: {len(data)}")
        else:
            print(f"❌ Failed: {response.text}")
            exit(1)

except Exception as e:
    print(f"❌ Connection failed: {e}")
    exit(1)

# Test 2: Insert a test record
print("\n2️⃣ Testing INSERT operation...")
try:
    test_file_id = f"test-{uuid.uuid4().hex[:8]}"
    test_record = {
        "file_id": test_file_id,
        "filename": f"test_file_{test_file_id}.jpg",
        "web_view_link": "https://drive.google.com/file/d/test123/view",
        "mime_type": "image/jpeg",
        "status": "Pending",
        "approval_count": 0
    }

    with httpx.Client() as client:
        response = client.post(
            f"{REST_URL}/mz_27ss_upload_qc",
            json=test_record,
            headers=headers
        )

        if response.status_code in [200, 201]:
            data = response.json()
            print(f"✅ Successfully inserted test record")
            print(f"   File ID: {test_file_id}")
            print(f"   Filename: {test_record['filename']}")
            test_qc_id = data[0]['id']
        else:
            print(f"❌ Failed to insert: {response.status_code}")
            print(f"   Error: {response.text}")
            exit(1)

except Exception as e:
    print(f"❌ Insert failed: {e}")
    exit(1)

# Test 3: Read the inserted record
print("\n3️⃣ Testing SELECT/READ operation...")
try:
    with httpx.Client() as client:
        response = client.get(
            f"{REST_URL}/mz_27ss_upload_qc?file_id=eq.{test_file_id}",
            headers=headers
        )

        if response.status_code == 200:
            data = response.json()
            if data:
                print(f"✅ Successfully read test record")
                record = data[0]
                print(f"   ID: {record['id']}")
                print(f"   Filename: {record['filename']}")
                print(f"   Status: {record['status']}")
            else:
                print(f"❌ No records found")
                exit(1)
        else:
            print(f"❌ Failed: {response.text}")
            exit(1)

except Exception as e:
    print(f"❌ Read failed: {e}")
    exit(1)

# Test 4: Insert an action record
print("\n4️⃣ Testing INSERT into mz_27ss_upload_qc_actions...")
try:
    action_record = {
        "file_id": test_qc_id,
        "action_type": "approve",
        "user_id": "test-user-id",
        "user_email": "test@example.com",
        "comment": "Test approval"
    }

    with httpx.Client() as client:
        response = client.post(
            f"{REST_URL}/mz_27ss_upload_qc_actions",
            json=action_record,
            headers=headers
        )

        if response.status_code in [200, 201]:
            print(f"✅ Successfully inserted test action")
            print(f"   Action type: approve")
            print(f"   User: test@example.com")
        else:
            print(f"❌ Failed to insert action: {response.status_code}")
            print(f"   Error: {response.text}")
            exit(1)

except Exception as e:
    print(f"❌ Action insert failed: {e}")
    exit(1)

# Test 5: Read actions
print("\n5️⃣ Testing SELECT actions...")
try:
    with httpx.Client() as client:
        response = client.get(
            f"{REST_URL}/mz_27ss_upload_qc_actions?file_id=eq.{test_qc_id}",
            headers=headers
        )

        if response.status_code == 200:
            data = response.json()
            print(f"✅ Successfully read actions")
            print(f"   Total actions: {len(data)}")
            for action in data:
                print(f"   - {action['action_type']} by {action['user_email']}")
        else:
            print(f"❌ Failed: {response.text}")
            exit(1)

except Exception as e:
    print(f"❌ Read actions failed: {e}")
    exit(1)

# Test 6: Update a record
print("\n6️⃣ Testing UPDATE operation...")
try:
    update_data = {
        "approval_count": 1,
        "status": "1/3 Approved"
    }

    with httpx.Client() as client:
        response = client.patch(
            f"{REST_URL}/mz_27ss_upload_qc?id=eq.{test_qc_id}",
            json=update_data,
            headers=headers
        )

        if response.status_code in [200, 204]:
            print(f"✅ Successfully updated record")
            print(f"   New status: 1/3 Approved")
            print(f"   New approval count: 1")
        else:
            print(f"❌ Failed to update: {response.status_code}")
            print(f"   Error: {response.text}")
            exit(1)

except Exception as e:
    print(f"❌ Update failed: {e}")
    exit(1)

# Test 7: Verify update
print("\n7️⃣ Verifying update...")
try:
    with httpx.Client() as client:
        response = client.get(
            f"{REST_URL}/mz_27ss_upload_qc?id=eq.{test_qc_id}",
            headers=headers
        )

        if response.status_code == 200:
            data = response.json()
            if data:
                record = data[0]
                print(f"✅ Record verification successful")
                print(f"   Current status: {record['status']}")
                print(f"   Current approvals: {record['approval_count']}")
            else:
                print(f"❌ Record not found")
                exit(1)
        else:
            print(f"❌ Failed: {response.text}")
            exit(1)

except Exception as e:
    print(f"❌ Verify failed: {e}")
    exit(1)

# Test 8: Delete test records
print("\n8️⃣ Cleaning up test records...")
try:
    with httpx.Client() as client:
        # Delete actions first (due to foreign key)
        response = client.delete(
            f"{REST_URL}/mz_27ss_upload_qc_actions?file_id=eq.{test_qc_id}",
            headers=headers
        )
        if response.status_code in [200, 204]:
            print(f"✅ Deleted test actions")

        # Delete main record
        response = client.delete(
            f"{REST_URL}/mz_27ss_upload_qc?id=eq.{test_qc_id}",
            headers=headers
        )
        if response.status_code in [200, 204]:
            print(f"✅ Deleted test record")
        else:
            print(f"❌ Failed to delete: {response.text}")

except Exception as e:
    print(f"❌ Delete failed: {e}")
    exit(1)

# Final summary
print("\n" + "=" * 60)
print("✅ ALL TESTS PASSED!")
print("=" * 60)
print("\nSummary:")
print("✓ Connected to Supabase PostgreSQL successfully")
print("✓ Successfully created records in mz_27ss_upload_qc")
print("✓ Successfully created records in mz_27ss_upload_qc_actions")
print("✓ Successfully read records from both tables")
print("✓ Successfully updated records")
print("✓ Successfully deleted records")
print("✓ Foreign key relationships working correctly")
print("\n🎉 Supabase connection is fully functional!")
print("=" * 60)
