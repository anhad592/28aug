#!/usr/bin/env python3
"""
Test: Edit items → Save price change persists on Dispatch Report
Bug fix verification for JK Products Factory Order Management
"""

import requests
import json
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any

# Base URL from frontend/.env
BASE_URL = "https://summer-deploy.preview.emergentagent.com/api"

# Test credentials
USERNAME = "admin"
PASSWORD = "admin123"

# Global token storage
TOKEN = None

def login() -> str:
    """Login and return JWT token"""
    global TOKEN
    print("\n=== Step 0: Login ===")
    url = f"{BASE_URL}/auth/login"
    payload = {"email": USERNAME, "password": PASSWORD}
    
    response = requests.post(url, json=payload)
    print(f"Login status: {response.status_code}")
    
    if response.status_code != 200:
        print(f"Login failed: {response.text}")
        raise Exception(f"Login failed with status {response.status_code}")
    
    # Try different token key names
    data = response.json() if response.headers.get('content-type', '').startswith('application/json') else {}
    
    # Handle plain string response
    if isinstance(data, str):
        TOKEN = data
        print(f"Token obtained (plain string): {TOKEN[:50]}...")
        return TOKEN
    
    # Try different keys
    for key in ['token', 'access_token', 'foms_token']:
        if key in data:
            TOKEN = data[key]
            print(f"Token obtained (key={key}): {TOKEN[:50]}...")
            return TOKEN
    
    print(f"Response data: {data}")
    raise Exception("No token found in login response")

def get_headers() -> Dict[str, str]:
    """Get authorization headers"""
    if not TOKEN:
        login()
    return {
        "Authorization": f"Bearer {TOKEN}",
        "Content-Type": "application/json"
    }

def find_dispatch_with_items() -> tuple[str, str, str, float, str]:
    """
    Walk back day-by-day up to 60 days to find a dispatch with items.
    Returns: (date_str, dispatch_id, item_id, original_net_price, report_line_net)
    """
    print("\n=== Step 1: Find dispatch with items ===")
    
    # IST timezone
    IST = timezone(timedelta(hours=5, minutes=30))
    today_ist = datetime.now(IST).date()
    
    for days_back in range(60):
        target_date = today_ist - timedelta(days=days_back)
        date_str = target_date.isoformat()
        
        url = f"{BASE_URL}/reports/daily-dispatch?date={date_str}"
        response = requests.get(url, headers=get_headers())
        
        if response.status_code != 200:
            print(f"  Date {date_str}: Failed with status {response.status_code}")
            continue
        
        data = response.json()
        
        # Check if we have groups with dispatches with items
        if not data.get('groups'):
            print(f"  Date {date_str}: No groups")
            continue
        
        for group in data['groups']:
            if not group.get('dispatches'):
                continue
            
            for dispatch in group['dispatches']:
                items = dispatch.get('items', [])
                if not items:
                    continue
                
                # Find first item with positive quantity
                for item in items:
                    qty = int(item.get('quantity', 0))
                    if qty > 0:
                        did = dispatch['id']
                        iid = item['item_id']
                        original_net = float(item.get('net_unit_price', 0))
                        
                        # Find corresponding report line
                        report_line_net = None
                        for line in group.get('lines', []):
                            if line.get('item_id') == iid and line.get('dispatch_id') == did:
                                report_line_net = float(line.get('net_unit_price', 0))
                                break
                        
                        print(f"✓ Found dispatch on {date_str}")
                        print(f"  Dispatch ID: {did}")
                        print(f"  Item ID: {iid}")
                        print(f"  Item Name: {item.get('item_name', 'N/A')}")
                        print(f"  Quantity: {qty}")
                        print(f"  Original net_unit_price (dispatch item): ₹{original_net:.2f}")
                        print(f"  Report line net_unit_price: ₹{report_line_net:.2f}" if report_line_net is not None else "  Report line: NOT FOUND")
                        
                        # Verify they match (within ₹0.02)
                        if report_line_net is not None:
                            diff = abs(original_net - report_line_net)
                            if diff <= 0.02:
                                print(f"  ✓ Prices match (diff: ₹{diff:.2f})")
                            else:
                                print(f"  ⚠ Prices differ by ₹{diff:.2f}")
                        
                        return date_str, did, iid, original_net, report_line_net
        
        print(f"  Date {date_str}: No suitable items found")
    
    raise Exception("No dispatch with items found in the last 60 days")

def patch_dispatch_price(did: str, new_price: float, existing_dispatch: Dict[str, Any]) -> Dict[str, Any]:
    """
    PATCH dispatch to change the first item's price
    Returns the response JSON
    """
    print(f"\n=== Step 2: PATCH dispatch {did} with new price ₹{new_price:.2f} ===")
    
    # Clone existing items and modify first item's price
    items = []
    for idx, item in enumerate(existing_dispatch.get('items', [])):
        item_data = {
            "item_id": item.get('item_id'),
            "item_name": item.get('item_name'),
            "product_name": item.get('product_name', ''),
            "variant": item.get('variant', ''),
            "quantity": item.get('quantity'),
            "unit_price": new_price if idx == 0 else item.get('unit_price', 0),
            "net_unit_price": new_price if idx == 0 else item.get('net_unit_price', 0),
            "discount_value": item.get('discount_value', 0),
            "discount_type": item.get('discount_type', ''),
            "description": item.get('description', '')
        }
        items.append(item_data)
    
    url = f"{BASE_URL}/dispatches/{did}"
    payload = {"items": items}
    
    print(f"  Patching first item to ₹{new_price:.2f}")
    response = requests.patch(url, json=payload, headers=get_headers())
    
    print(f"  Response status: {response.status_code}")
    
    if response.status_code != 200:
        print(f"  ✗ PATCH failed: {response.text}")
        raise Exception(f"PATCH failed with status {response.status_code}")
    
    data = response.json()
    
    # Verify price_override flag
    if data.get('items') and len(data['items']) > 0:
        first_item = data['items'][0]
        price_override = first_item.get('price_override', False)
        print(f"  price_override flag: {price_override}")
        
        if price_override:
            print(f"  ✓ price_override = true")
        else:
            print(f"  ✗ price_override = false (EXPECTED true)")
    else:
        print(f"  ⚠ No items in response")
    
    return data

def verify_report_shows_override(date_str: str, did: str, iid: str, expected_price: float) -> tuple[bool, bool]:
    """
    Re-GET the daily-dispatch report and verify the override persists
    Returns: (dispatch_item_correct, report_line_correct)
    """
    print(f"\n=== Step 3: Verify report shows override price ₹{expected_price:.2f} ===")
    
    url = f"{BASE_URL}/reports/daily-dispatch?date={date_str}"
    response = requests.get(url, headers=get_headers())
    
    if response.status_code != 200:
        print(f"  ✗ GET report failed: {response.status_code}")
        return False, False
    
    data = response.json()
    
    dispatch_item_correct = False
    report_line_correct = False
    
    # Find the dispatch and item
    for group in data.get('groups', []):
        for dispatch in group.get('dispatches', []):
            if dispatch['id'] == did:
                # Check dispatch items
                for item in dispatch.get('items', []):
                    if item.get('item_id') == iid:
                        actual_net = float(item.get('net_unit_price', 0))
                        print(f"  Dispatch item net_unit_price: ₹{actual_net:.2f}")
                        
                        if abs(actual_net - expected_price) <= 0.02:
                            print(f"  ✓ Dispatch item shows override price")
                            dispatch_item_correct = True
                        else:
                            print(f"  ✗ Dispatch item shows ₹{actual_net:.2f}, expected ₹{expected_price:.2f}")
                        break
                
                # Check report lines
                for line in group.get('lines', []):
                    if line.get('item_id') == iid and line.get('dispatch_id') == did:
                        actual_line_net = float(line.get('net_unit_price', 0))
                        actual_line_value = float(line.get('line_value', 0))
                        expected_line_value = expected_price * line.get('quantity', 0)
                        
                        print(f"  Report line net_unit_price: ₹{actual_line_net:.2f}")
                        print(f"  Report line line_value: ₹{actual_line_value:.2f}")
                        print(f"  Expected line_value: ₹{expected_line_value:.2f}")
                        
                        if abs(actual_line_net - expected_price) <= 0.02 and abs(actual_line_value - expected_line_value) <= 0.02:
                            print(f"  ✓ Report line shows override price and correct line_value")
                            report_line_correct = True
                        else:
                            print(f"  ✗ Report line incorrect")
                        break
                
                return dispatch_item_correct, report_line_correct
    
    print(f"  ✗ Dispatch {did} not found in report")
    return False, False

def restore_original_price(did: str, original_price: float, existing_dispatch: Dict[str, Any]) -> None:
    """
    PATCH dispatch to restore original price
    """
    print(f"\n=== Step 4: Restore original price ₹{original_price:.2f} ===")
    
    # Clone existing items and restore first item's price
    items = []
    for idx, item in enumerate(existing_dispatch.get('items', [])):
        item_data = {
            "item_id": item.get('item_id'),
            "item_name": item.get('item_name'),
            "product_name": item.get('product_name', ''),
            "variant": item.get('variant', ''),
            "quantity": item.get('quantity'),
            "unit_price": original_price if idx == 0 else item.get('unit_price', 0),
            "net_unit_price": original_price if idx == 0 else item.get('net_unit_price', 0),
            "discount_value": item.get('discount_value', 0),
            "discount_type": item.get('discount_type', ''),
            "description": item.get('description', '')
        }
        items.append(item_data)
    
    url = f"{BASE_URL}/dispatches/{did}"
    payload = {"items": items}
    
    response = requests.patch(url, json=payload, headers=get_headers())
    
    print(f"  Response status: {response.status_code}")
    
    if response.status_code == 200:
        print(f"  ✓ Original price restored")
    else:
        print(f"  ⚠ Restore failed: {response.text}")

def get_dispatch_details(date_str: str, did: str) -> Optional[Dict[str, Any]]:
    """Get full dispatch details from daily report"""
    url = f"{BASE_URL}/reports/daily-dispatch?date={date_str}"
    response = requests.get(url, headers=get_headers())
    
    if response.status_code != 200:
        return None
    
    data = response.json()
    for group in data.get('groups', []):
        for dispatch in group.get('dispatches', []):
            if dispatch['id'] == did:
                return dispatch
    
    return None

def main():
    """Main test flow"""
    print("=" * 80)
    print("TEST: Edit items → Save price change persists on Dispatch Report")
    print("=" * 80)
    
    try:
        # Step 0: Login
        login()
        
        # Step 1: Find a dispatch with items
        date_str, did, iid, original_net, report_line_net = find_dispatch_with_items()
        
        # Get full dispatch details
        existing_dispatch = get_dispatch_details(date_str, did)
        if not existing_dispatch:
            raise Exception("Could not retrieve dispatch details")
        
        # Step 2: PATCH with new price
        new_price = 9999.99
        patch_response = patch_dispatch_price(did, new_price, existing_dispatch)
        
        # Verify price_override in response
        step2_pass = False
        if patch_response.get('items') and len(patch_response['items']) > 0:
            first_item = patch_response['items'][0]
            if first_item.get('price_override') == True:
                step2_pass = True
        
        # Step 3: Verify report shows override
        dispatch_item_correct, report_line_correct = verify_report_shows_override(date_str, did, iid, new_price)
        
        # Step 4: Restore original price
        restore_original_price(did, original_net, existing_dispatch)
        
        # Print results table
        print("\n" + "=" * 80)
        print("TEST RESULTS")
        print("=" * 80)
        print(f"Step 2 - PATCH response shows price_override=true: {'✓ PASS' if step2_pass else '✗ FAIL'}")
        print(f"Step 3a - Dispatch item shows override price: {'✓ PASS' if dispatch_item_correct else '✗ FAIL'}")
        print(f"Step 3b - Report line shows override price: {'✓ PASS' if report_line_correct else '✗ FAIL'}")
        print("=" * 80)
        
        # Overall result
        all_pass = step2_pass and dispatch_item_correct and report_line_correct
        
        if all_pass:
            print("\n✓✓✓ ALL TESTS PASSED ✓✓✓")
            print("The bug fix is working correctly:")
            print("  - Price override flag is set on PATCH")
            print("  - Enriched dispatch items respect the override")
            print("  - Report lines respect the override")
        else:
            print("\n✗✗✗ SOME TESTS FAILED ✗✗✗")
            if not step2_pass:
                print("  - PATCH response does not set price_override=true")
            if not dispatch_item_correct:
                print("  - Dispatch items do not show override price")
            if not report_line_correct:
                print("  - Report lines do not show override price")
        
        return 0 if all_pass else 1
        
    except Exception as e:
        print(f"\n✗✗✗ TEST FAILED WITH ERROR ✗✗✗")
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
        return 1

if __name__ == "__main__":
    exit(main())
