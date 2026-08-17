#!/usr/bin/env python3
"""
Test script for JK1 blank_view demo account feature.
Tests that JK1 sees empty data while real admin sees actual data.
"""
import requests
import json
import re
import sys
from typing import Dict, Any, Optional

# Base URL from frontend/.env
BASE_URL = "https://dev-clone-7.preview.emergentagent.com/api"

# Test credentials
JK1_EMAIL = "JK1"
JK1_PASSWORD = "jk1123"
ADMIN_EMAIL = "admin@factory.com"
ADMIN_PASSWORD = "admin123"

# Color codes for output
GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
BLUE = "\033[94m"
RESET = "\033[0m"

class TestResult:
    def __init__(self):
        self.passed = []
        self.failed = []
        self.warnings = []
    
    def add_pass(self, test_name: str, details: str = ""):
        self.passed.append((test_name, details))
        print(f"{GREEN}✓ PASS{RESET}: {test_name}")
        if details:
            print(f"  {details}")
    
    def add_fail(self, test_name: str, details: str):
        self.failed.append((test_name, details))
        print(f"{RED}✗ FAIL{RESET}: {test_name}")
        print(f"  {details}")
    
    def add_warning(self, test_name: str, details: str):
        self.warnings.append((test_name, details))
        print(f"{YELLOW}⚠ WARNING{RESET}: {test_name}")
        print(f"  {details}")
    
    def summary(self):
        print("\n" + "="*80)
        print(f"{BLUE}TEST SUMMARY{RESET}")
        print("="*80)
        print(f"{GREEN}Passed: {len(self.passed)}{RESET}")
        print(f"{RED}Failed: {len(self.failed)}{RESET}")
        print(f"{YELLOW}Warnings: {len(self.warnings)}{RESET}")
        
        if self.failed:
            print(f"\n{RED}FAILED TESTS:{RESET}")
            for name, details in self.failed:
                print(f"  • {name}")
                print(f"    {details}")
        
        return len(self.failed) == 0


def get_admin_otp_from_logs(challenge_id: str) -> Optional[str]:
    """Read OTP code from backend logs."""
    try:
        with open("/var/log/supervisor/backend.out.log", "r") as f:
            lines = f.readlines()
        
        # Search from the end for the most recent OTP
        for line in reversed(lines):
            # Pattern: Admin OTP for admin@factory.com (challenge <id>): <code>
            match = re.search(rf"Admin OTP for .+ \(challenge {re.escape(challenge_id)}\): (\d{{6}})", line)
            if match:
                return match.group(1)
        return None
    except Exception as e:
        print(f"Error reading logs: {e}")
        return None


def test_jk1_login(result: TestResult) -> Optional[str]:
    """Test 1: JK1 login returns token directly (no OTP)."""
    print(f"\n{BLUE}Test 1: JK1 Login (case-insensitive){RESET}")
    
    # Test with uppercase "JK1"
    try:
        resp = requests.post(f"{BASE_URL}/auth/login", json={
            "email": "JK1",
            "password": JK1_PASSWORD
        }, timeout=10)
        
        if resp.status_code != 200:
            result.add_fail("JK1 login (uppercase)", f"Status {resp.status_code}: {resp.text}")
            return None
        
        data = resp.json()
        
        # Should have token, NOT otp_required
        if "otp_required" in data and data["otp_required"]:
            result.add_fail("JK1 login (uppercase)", "Unexpected OTP required for JK1")
            return None
        
        if "token" not in data:
            result.add_fail("JK1 login (uppercase)", f"No token in response: {data}")
            return None
        
        token = data["token"]
        result.add_pass("JK1 login (uppercase)", f"Token received: {token[:20]}...")
        
    except Exception as e:
        result.add_fail("JK1 login (uppercase)", f"Exception: {str(e)}")
        return None
    
    # Test with lowercase "jk1" to verify case-insensitivity
    try:
        resp = requests.post(f"{BASE_URL}/auth/login", json={
            "email": "jk1",
            "password": JK1_PASSWORD
        }, timeout=10)
        
        if resp.status_code != 200:
            result.add_fail("JK1 login (lowercase)", f"Status {resp.status_code}: {resp.text}")
            return token  # Return the uppercase token anyway
        
        data = resp.json()
        
        if "token" not in data:
            result.add_fail("JK1 login (lowercase)", f"No token in response: {data}")
            return token
        
        result.add_pass("JK1 login (lowercase)", "Case-insensitive login works")
        
    except Exception as e:
        result.add_fail("JK1 login (lowercase)", f"Exception: {str(e)}")
    
    return token


def test_jk1_auth_me(result: TestResult, token: str):
    """Test 2: GET /auth/me returns JK1 user with role=admin."""
    print(f"\n{BLUE}Test 2: JK1 /auth/me{RESET}")
    
    try:
        resp = requests.get(f"{BASE_URL}/auth/me", headers={
            "Authorization": f"Bearer {token}"
        }, timeout=10)
        
        if resp.status_code != 200:
            result.add_fail("JK1 /auth/me", f"Status {resp.status_code}: {resp.text}")
            return
        
        user = resp.json()
        
        # Check username
        if user.get("username") != "JK1":
            result.add_fail("JK1 /auth/me", f"Username mismatch: {user.get('username')} != JK1")
            return
        
        # Check role
        if user.get("role") != "admin":
            result.add_fail("JK1 /auth/me", f"Role mismatch: {user.get('role')} != admin")
            return
        
        result.add_pass("JK1 /auth/me", f"User: {user.get('username')}, Role: {user.get('role')}")
        
    except Exception as e:
        result.add_fail("JK1 /auth/me", f"Exception: {str(e)}")


def test_jk1_empty_data(result: TestResult, token: str):
    """Test 3: All data endpoints return empty for JK1."""
    print(f"\n{BLUE}Test 3: JK1 sees EMPTY data{RESET}")
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # Test /api/orders
    try:
        resp = requests.get(f"{BASE_URL}/orders", headers=headers, timeout=10)
        if resp.status_code != 200:
            result.add_fail("JK1 /orders", f"Status {resp.status_code}: {resp.text}")
        else:
            data = resp.json()
            if data == []:
                result.add_pass("JK1 /orders", "Returns empty array []")
            else:
                result.add_fail("JK1 /orders", f"Expected [], got: {data}")
    except Exception as e:
        result.add_fail("JK1 /orders", f"Exception: {str(e)}")
    
    # Test /api/customers
    try:
        resp = requests.get(f"{BASE_URL}/customers", headers=headers, timeout=10)
        if resp.status_code != 200:
            result.add_fail("JK1 /customers", f"Status {resp.status_code}: {resp.text}")
        else:
            data = resp.json()
            if data == []:
                result.add_pass("JK1 /customers", "Returns empty array []")
            else:
                result.add_fail("JK1 /customers", f"Expected [], got {len(data)} customers")
    except Exception as e:
        result.add_fail("JK1 /customers", f"Exception: {str(e)}")
    
    # Test /api/customers/search
    try:
        resp = requests.get(f"{BASE_URL}/customers/search?q=a", headers=headers, timeout=10)
        if resp.status_code != 200:
            result.add_fail("JK1 /customers/search", f"Status {resp.status_code}: {resp.text}")
        else:
            data = resp.json()
            if data == []:
                result.add_pass("JK1 /customers/search", "Returns empty array []")
            else:
                result.add_fail("JK1 /customers/search", f"Expected [], got: {data}")
    except Exception as e:
        result.add_fail("JK1 /customers/search", f"Exception: {str(e)}")
    
    # Test /api/dispatches
    try:
        resp = requests.get(f"{BASE_URL}/dispatches", headers=headers, timeout=10)
        if resp.status_code != 200:
            result.add_fail("JK1 /dispatches", f"Status {resp.status_code}: {resp.text}")
        else:
            data = resp.json()
            if data == []:
                result.add_pass("JK1 /dispatches", "Returns empty array []")
            else:
                result.add_fail("JK1 /dispatches", f"Expected [], got {len(data)} dispatches")
    except Exception as e:
        result.add_fail("JK1 /dispatches", f"Exception: {str(e)}")
    
    # Test /api/admin/dispatch-ledger
    try:
        resp = requests.get(f"{BASE_URL}/admin/dispatch-ledger", headers=headers, timeout=10)
        if resp.status_code != 200:
            result.add_fail("JK1 /admin/dispatch-ledger", f"Status {resp.status_code}: {resp.text}")
        else:
            data = resp.json()
            expected = {"total": 0, "items": [], "grand_total_value": 0, "grand_total_pcs": 0}
            if (data.get("total") == 0 and 
                data.get("items") == [] and 
                data.get("grand_total_value") == 0 and 
                data.get("grand_total_pcs") == 0):
                result.add_pass("JK1 /admin/dispatch-ledger", "Returns empty ledger")
            else:
                result.add_fail("JK1 /admin/dispatch-ledger", f"Expected {expected}, got: {data}")
    except Exception as e:
        result.add_fail("JK1 /admin/dispatch-ledger", f"Exception: {str(e)}")
    
    # Test /api/reports/daily-dispatch
    try:
        resp = requests.get(f"{BASE_URL}/reports/daily-dispatch", headers=headers, timeout=10)
        if resp.status_code != 200:
            result.add_fail("JK1 /reports/daily-dispatch", f"Status {resp.status_code}: {resp.text}")
        else:
            data = resp.json()
            if (data.get("groups") == [] and 
                data.get("grand_total_pcs") == 0 and 
                data.get("dispatch_count") == 0):
                result.add_pass("JK1 /reports/daily-dispatch", "Returns empty report")
            else:
                result.add_fail("JK1 /reports/daily-dispatch", 
                    f"Expected empty groups/counts, got: groups={len(data.get('groups', []))}, "
                    f"pcs={data.get('grand_total_pcs')}, count={data.get('dispatch_count')}")
    except Exception as e:
        result.add_fail("JK1 /reports/daily-dispatch", f"Exception: {str(e)}")
    
    # Test /api/dashboard/summary
    try:
        resp = requests.get(f"{BASE_URL}/dashboard/summary", headers=headers, timeout=10)
        if resp.status_code != 200:
            result.add_fail("JK1 /dashboard/summary", f"Status {resp.status_code}: {resp.text}")
        else:
            data = resp.json()
            stats = data.get("stats", {})
            if (stats.get("total_orders") == 0 and
                stats.get("pending_orders") == 0 and
                stats.get("dispatched_orders") == 0 and
                stats.get("cleared_orders") == 0 and
                stats.get("customers") == 0 and
                stats.get("products") == 0 and
                data.get("item_totals") == [] and
                data.get("product_totals") == [] and
                data.get("party_breakdown") == [] and
                data.get("overdue_customers") == []):
                result.add_pass("JK1 /dashboard/summary", "All stats zero, all arrays empty")
            else:
                result.add_fail("JK1 /dashboard/summary", 
                    f"Expected all zeros/empty, got stats: {stats}, "
                    f"item_totals: {len(data.get('item_totals', []))}, "
                    f"product_totals: {len(data.get('product_totals', []))}")
    except Exception as e:
        result.add_fail("JK1 /dashboard/summary", f"Exception: {str(e)}")


def test_admin_login(result: TestResult) -> Optional[str]:
    """Test 4: Real admin login with OTP."""
    print(f"\n{BLUE}Test 4: Real Admin Login (with OTP){RESET}")
    
    # Step 1: Login request
    try:
        resp = requests.post(f"{BASE_URL}/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        }, timeout=10)
        
        if resp.status_code != 200:
            result.add_fail("Admin login step 1", f"Status {resp.status_code}: {resp.text}")
            return None
        
        data = resp.json()
        
        if not data.get("otp_required"):
            result.add_fail("Admin login step 1", "Expected otp_required=true")
            return None
        
        challenge_id = data.get("challenge_id")
        if not challenge_id:
            result.add_fail("Admin login step 1", "No challenge_id in response")
            return None
        
        result.add_pass("Admin login step 1", f"OTP required, challenge_id: {challenge_id}")
        
    except Exception as e:
        result.add_fail("Admin login step 1", f"Exception: {str(e)}")
        return None
    
    # Step 2: Get OTP from logs
    otp_code = get_admin_otp_from_logs(challenge_id)
    if not otp_code:
        result.add_fail("Admin OTP retrieval", "Could not find OTP in logs")
        return None
    
    result.add_pass("Admin OTP retrieval", f"OTP code: {otp_code}")
    
    # Step 3: Verify OTP
    try:
        resp = requests.post(f"{BASE_URL}/auth/verify-otp", json={
            "challenge_id": challenge_id,
            "code": otp_code
        }, timeout=10)
        
        if resp.status_code != 200:
            result.add_fail("Admin OTP verification", f"Status {resp.status_code}: {resp.text}")
            return None
        
        data = resp.json()
        
        if "token" not in data:
            result.add_fail("Admin OTP verification", f"No token in response: {data}")
            return None
        
        token = data["token"]
        result.add_pass("Admin OTP verification", f"Token received: {token[:20]}...")
        return token
        
    except Exception as e:
        result.add_fail("Admin OTP verification", f"Exception: {str(e)}")
        return None


def test_admin_sees_data(result: TestResult, token: str):
    """Test 5: Real admin sees actual data (not empty)."""
    print(f"\n{BLUE}Test 5: Real Admin sees ACTUAL data{RESET}")
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # Test /api/dashboard/summary
    try:
        resp = requests.get(f"{BASE_URL}/dashboard/summary", headers=headers, timeout=10)
        if resp.status_code != 200:
            result.add_fail("Admin /dashboard/summary", f"Status {resp.status_code}: {resp.text}")
        else:
            data = resp.json()
            stats = data.get("stats", {})
            total_orders = stats.get("total_orders", 0)
            customers = stats.get("customers", 0)
            products = stats.get("products", 0)
            
            if total_orders > 0 or customers > 0 or products > 0:
                result.add_pass("Admin /dashboard/summary", 
                    f"Has data: orders={total_orders}, customers={customers}, products={products}")
            else:
                result.add_warning("Admin /dashboard/summary", 
                    "All stats are zero - expected some data for real admin")
    except Exception as e:
        result.add_fail("Admin /dashboard/summary", f"Exception: {str(e)}")
    
    # Test /api/customers
    try:
        resp = requests.get(f"{BASE_URL}/customers", headers=headers, timeout=10)
        if resp.status_code != 200:
            result.add_fail("Admin /customers", f"Status {resp.status_code}: {resp.text}")
        else:
            data = resp.json()
            if len(data) > 0:
                result.add_pass("Admin /customers", f"Has {len(data)} customers")
            else:
                result.add_warning("Admin /customers", "Empty - expected some customers for real admin")
    except Exception as e:
        result.add_fail("Admin /customers", f"Exception: {str(e)}")
    
    # Test /api/orders
    try:
        resp = requests.get(f"{BASE_URL}/orders", headers=headers, timeout=10)
        if resp.status_code != 200:
            result.add_fail("Admin /orders", f"Status {resp.status_code}: {resp.text}")
        else:
            data = resp.json()
            if len(data) > 0:
                result.add_pass("Admin /orders", f"Has {len(data)} orders")
            else:
                result.add_warning("Admin /orders", "Empty - expected some orders for real admin")
    except Exception as e:
        result.add_fail("Admin /orders", f"Exception: {str(e)}")
    
    # Test /api/admin/dispatch-ledger
    try:
        resp = requests.get(f"{BASE_URL}/admin/dispatch-ledger", headers=headers, timeout=10)
        if resp.status_code != 200:
            result.add_fail("Admin /admin/dispatch-ledger", f"Status {resp.status_code}: {resp.text}")
        else:
            data = resp.json()
            total = data.get("total", 0)
            if total > 0:
                result.add_pass("Admin /admin/dispatch-ledger", f"Has {total} dispatches")
            else:
                result.add_warning("Admin /admin/dispatch-ledger", 
                    "Empty - expected some dispatches for real admin")
    except Exception as e:
        result.add_fail("Admin /admin/dispatch-ledger", f"Exception: {str(e)}")


def main():
    print(f"{BLUE}{'='*80}{RESET}")
    print(f"{BLUE}JK1 Blank View Demo Account Test Suite{RESET}")
    print(f"{BLUE}{'='*80}{RESET}")
    print(f"Base URL: {BASE_URL}")
    print()
    
    result = TestResult()
    
    # Test JK1 login
    jk1_token = test_jk1_login(result)
    if not jk1_token:
        print(f"\n{RED}Cannot proceed without JK1 token{RESET}")
        result.summary()
        sys.exit(1)
    
    # Test JK1 /auth/me
    test_jk1_auth_me(result, jk1_token)
    
    # Test JK1 sees empty data
    test_jk1_empty_data(result, jk1_token)
    
    # Test real admin login
    admin_token = test_admin_login(result)
    if not admin_token:
        print(f"\n{RED}Cannot test admin data without admin token{RESET}")
        result.summary()
        sys.exit(1)
    
    # Test admin sees actual data
    test_admin_sees_data(result, admin_token)
    
    # Summary
    success = result.summary()
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
