#!/usr/bin/env python3
"""
Backend test for Admin Email-OTP Two-Step Login Flow
Tests the Factory Order Management System's admin authentication
"""
import requests
import re
import time

# Base URL from frontend/.env
BASE_URL = "https://dev-clone-7.preview.emergentagent.com/api"

# Test credentials (from review request)
ADMIN_EMAIL = "admin"
ADMIN_PASSWORD = "admin123"
USER_EMAIL = "user"
USER_PASSWORD = "user123"

def print_section(title):
    print(f"\n{'='*70}")
    print(f"  {title}")
    print(f"{'='*70}")

def print_result(test_name, passed, details=""):
    status = "✅ PASS" if passed else "❌ FAIL"
    print(f"\n{status} - {test_name}")
    if details:
        print(f"  Details: {details}")

def read_otp_from_logs(challenge_id):
    """Read the OTP code from backend logs for the given challenge_id"""
    try:
        # Read backend.out.log
        with open('/var/log/supervisor/backend.out.log', 'r') as f:
            lines = f.readlines()
        
        # Search for the OTP log line matching the challenge_id
        # Format: "Admin OTP for admin@factory.com (challenge <id>): <6-digit-code>"
        pattern = rf"Admin OTP for .+ \(challenge {re.escape(challenge_id)}\): (\d{{6}})"
        
        for line in reversed(lines):  # Search from end (most recent)
            match = re.search(pattern, line)
            if match:
                return match.group(1)
        
        # Also check backend.err.log
        with open('/var/log/supervisor/backend.err.log', 'r') as f:
            lines = f.readlines()
        
        for line in reversed(lines):
            match = re.search(pattern, line)
            if match:
                return match.group(1)
        
        return None
    except Exception as e:
        print(f"  Error reading logs: {e}")
        return None

def test_1_admin_login_step1():
    """Test 1: ADMIN login step 1 - should return OTP challenge"""
    print_section("TEST 1: Admin Login Step 1 (OTP Challenge)")
    
    payload = {"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
    
    try:
        response = requests.post(f"{BASE_URL}/auth/login", json=payload, timeout=10)
        
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.json()}")
        
        if response.status_code != 200:
            print_result("Admin Login Step 1", False, f"Expected 200, got {response.status_code}")
            return None
        
        data = response.json()
        
        # Check required fields
        checks = [
            ("otp_required" in data and data["otp_required"] == True, "otp_required is True"),
            ("challenge_id" in data and data["challenge_id"], "challenge_id present and non-empty"),
            ("sent_to" in data, "sent_to field present"),
            ("token" not in data, "NO token field (as expected)"),
        ]
        
        all_passed = all(check[0] for check in checks)
        
        for check, desc in checks:
            symbol = "✓" if check else "✗"
            print(f"  {symbol} {desc}")
        
        print_result("Admin Login Step 1", all_passed)
        
        if all_passed:
            return data["challenge_id"]
        return None
        
    except Exception as e:
        print_result("Admin Login Step 1", False, f"Exception: {e}")
        return None

def test_2_retrieve_otp(challenge_id):
    """Test 2: Retrieve OTP code from backend logs"""
    print_section("TEST 2: Retrieve OTP from Backend Logs")
    
    if not challenge_id:
        print_result("Retrieve OTP", False, "No challenge_id from step 1")
        return None
    
    print(f"Looking for OTP for challenge_id: {challenge_id}")
    
    otp_code = read_otp_from_logs(challenge_id)
    
    if otp_code:
        print(f"Found OTP code: {otp_code}")
        print_result("Retrieve OTP", True, f"Successfully extracted OTP: {otp_code}")
        return otp_code
    else:
        print_result("Retrieve OTP", False, "Could not find OTP in logs")
        return None

def test_3_admin_verify_correct_code(challenge_id, otp_code):
    """Test 3: ADMIN verify step 2 with correct code"""
    print_section("TEST 3: Admin Verify OTP (Correct Code)")
    
    if not challenge_id or not otp_code:
        print_result("Admin Verify (Correct)", False, "Missing challenge_id or OTP code")
        return None
    
    payload = {"challenge_id": challenge_id, "code": otp_code}
    
    try:
        response = requests.post(f"{BASE_URL}/auth/verify-otp", json=payload, timeout=10)
        
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.json()}")
        
        if response.status_code != 200:
            print_result("Admin Verify (Correct)", False, f"Expected 200, got {response.status_code}")
            return None
        
        data = response.json()
        
        # Check required fields
        checks = [
            ("token" in data and data["token"], "token present and non-empty"),
            ("user" in data, "user object present"),
            (data.get("user", {}).get("role") == "admin", "user role is 'admin'"),
        ]
        
        all_passed = all(check[0] for check in checks)
        
        for check, desc in checks:
            symbol = "✓" if check else "✗"
            print(f"  {symbol} {desc}")
        
        # Test the token with /auth/me
        if "token" in data:
            print("\n  Testing token with GET /auth/me...")
            token = data["token"]
            headers = {"Authorization": f"Bearer {token}"}
            me_response = requests.get(f"{BASE_URL}/auth/me", headers=headers, timeout=10)
            
            print(f"  /auth/me Status: {me_response.status_code}")
            
            if me_response.status_code == 200:
                me_data = me_response.json()
                print(f"  /auth/me Response: {me_data}")
                
                if me_data.get("role") == "admin":
                    print(f"  ✓ Token verified successfully, user is admin")
                    all_passed = all_passed and True
                else:
                    print(f"  ✗ Token verified but role is not admin")
                    all_passed = False
            else:
                print(f"  ✗ Token verification failed")
                all_passed = False
        
        print_result("Admin Verify (Correct)", all_passed)
        return data.get("token") if all_passed else None
        
    except Exception as e:
        print_result("Admin Verify (Correct)", False, f"Exception: {e}")
        return None

def test_4_admin_verify_wrong_code():
    """Test 4: ADMIN verify with WRONG code"""
    print_section("TEST 4: Admin Verify OTP (Wrong Code)")
    
    # First, get a fresh challenge_id
    print("Getting fresh challenge_id...")
    payload = {"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
    
    try:
        response = requests.post(f"{BASE_URL}/auth/login", json=payload, timeout=10)
        
        if response.status_code != 200:
            print_result("Admin Verify (Wrong Code)", False, "Could not get fresh challenge_id")
            return
        
        data = response.json()
        challenge_id = data.get("challenge_id")
        
        if not challenge_id:
            print_result("Admin Verify (Wrong Code)", False, "No challenge_id in response")
            return
        
        print(f"Got challenge_id: {challenge_id}")
        
        # Get the real OTP to ensure we use a different one
        real_otp = read_otp_from_logs(challenge_id)
        wrong_code = "000000"
        
        # Make sure wrong_code is different from real_otp
        if real_otp == wrong_code:
            wrong_code = "111111"
        
        print(f"Using wrong code: {wrong_code} (real code is: {real_otp})")
        
        # Try to verify with wrong code
        verify_payload = {"challenge_id": challenge_id, "code": wrong_code}
        verify_response = requests.post(f"{BASE_URL}/auth/verify-otp", json=verify_payload, timeout=10)
        
        print(f"Status Code: {verify_response.status_code}")
        print(f"Response: {verify_response.json()}")
        
        # Should get 401 with error detail
        checks = [
            (verify_response.status_code == 401, "Status code is 401"),
            ("detail" in verify_response.json(), "Error detail present"),
            ("token" not in verify_response.json(), "NO token issued"),
        ]
        
        all_passed = all(check[0] for check in checks)
        
        for check, desc in checks:
            symbol = "✓" if check else "✗"
            print(f"  {symbol} {desc}")
        
        print_result("Admin Verify (Wrong Code)", all_passed)
        
    except Exception as e:
        print_result("Admin Verify (Wrong Code)", False, f"Exception: {e}")

def test_5_non_admin_login():
    """Test 5: NON-ADMIN login (should NOT require OTP)"""
    print_section("TEST 5: Non-Admin Login (Direct Token)")
    
    payload = {"email": USER_EMAIL, "password": USER_PASSWORD}
    
    try:
        response = requests.post(f"{BASE_URL}/auth/login", json=payload, timeout=10)
        
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.json()}")
        
        if response.status_code != 200:
            print_result("Non-Admin Login", False, f"Expected 200, got {response.status_code}")
            return
        
        data = response.json()
        
        # Check required fields
        checks = [
            ("token" in data and data["token"], "token present and non-empty"),
            ("user" in data, "user object present"),
            (data.get("user", {}).get("role") == "user", "user role is 'user'"),
            ("otp_required" not in data or not data.get("otp_required"), "NO otp_required field (or False)"),
        ]
        
        all_passed = all(check[0] for check in checks)
        
        for check, desc in checks:
            symbol = "✓" if check else "✗"
            print(f"  {symbol} {desc}")
        
        print_result("Non-Admin Login", all_passed)
        
    except Exception as e:
        print_result("Non-Admin Login", False, f"Exception: {e}")

def test_6_invalid_challenge():
    """Test 6: Invalid challenge_id"""
    print_section("TEST 6: Invalid Challenge ID")
    
    payload = {"challenge_id": "does-not-exist", "code": "123456"}
    
    try:
        response = requests.post(f"{BASE_URL}/auth/verify-otp", json=payload, timeout=10)
        
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.json()}")
        
        # Should get 400 with error detail
        checks = [
            (response.status_code == 400, "Status code is 400"),
            ("detail" in response.json(), "Error detail present"),
        ]
        
        all_passed = all(check[0] for check in checks)
        
        for check, desc in checks:
            symbol = "✓" if check else "✗"
            print(f"  {symbol} {desc}")
        
        print_result("Invalid Challenge", all_passed)
        
    except Exception as e:
        print_result("Invalid Challenge", False, f"Exception: {e}")

def main():
    print("\n" + "="*70)
    print("  ADMIN EMAIL-OTP TWO-STEP LOGIN FLOW TEST")
    print("  Factory Order Management System")
    print("="*70)
    print(f"\nBase URL: {BASE_URL}")
    print(f"Admin Credentials: {ADMIN_EMAIL} / {ADMIN_PASSWORD}")
    print(f"User Credentials: {USER_EMAIL} / {USER_PASSWORD}")
    
    # Test 1: Admin login step 1
    challenge_id = test_1_admin_login_step1()
    
    # Test 2: Retrieve OTP from logs
    otp_code = test_2_retrieve_otp(challenge_id) if challenge_id else None
    
    # Test 3: Admin verify with correct code
    token = test_3_admin_verify_correct_code(challenge_id, otp_code) if challenge_id and otp_code else None
    
    # Test 4: Admin verify with wrong code
    test_4_admin_verify_wrong_code()
    
    # Test 5: Non-admin login (direct token)
    test_5_non_admin_login()
    
    # Test 6: Invalid challenge
    test_6_invalid_challenge()
    
    print("\n" + "="*70)
    print("  TEST SUITE COMPLETE")
    print("="*70 + "\n")

if __name__ == "__main__":
    main()
