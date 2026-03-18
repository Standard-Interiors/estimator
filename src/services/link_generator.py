# text_clothing_finder.py

import json
import os
import re
import time
from datetime import datetime
from typing import Dict, List, Optional, Tuple
import concurrent.futures
import urllib.parse

import anthropic
import requests
from bs4 import BeautifulSoup
from serpapi import GoogleSearch


class TextClothingFinder:
    def __init__(self, anthropic_key: str, serp_api_key: str = None):
        """Initialize with just the essentials."""
        self.client = anthropic.Anthropic(api_key=anthropic_key)
        self.serp_api_key = serp_api_key

    def parse_clothing_description(self, description: str) -> List[Dict]:
        """Convert text description into search strategies."""

        prompt = f"""
        Convert this clothing description into search strategies. For each item mentioned, provide:

        1. Multiple search queries from specific to general
        2. Key attributes for filtering results
        3. Price range estimates
        4. Search variations for different price points

        Description: "{description}"

        Return JSON:
        [
            {{
                "item_type": "specific type",
                "attributes": {{
                    "color": "exact color",
                    "style": "style description",
                    "material": "material type",
                    "fit": "fit type",
                    "length": "length if applicable",
                    "pattern": "pattern type",
                    "size": "size if specified"
                }},
                "search_queries": [
                    "most specific query with all details",
                    "medium specificity query",
                    "general fallback query"
                ],
                "budget_queries": [
                    "cheap/affordable version query",
                    "budget alternative query"
                ],
                "premium_queries": [
                    "luxury/premium version query",
                    "high-end designer query"
                ],
                "filters": {{
                    "gender": "mens/womens/unisex",
                    "category": "tops/bottoms/shoes/etc"
                }}
            }}
        ]
        """

        response = self.client.messages.create(
            model="claude-opus-4-20250514",
            max_tokens=2000,
            messages=[{
                "role": "user",
                "content": prompt
            }]
        )

        json_match = re.search(r'\[.*\]', response.content[0].text, re.DOTALL)
        return json.loads(json_match.group()) if json_match else []

    def clean_price(self, price_text: str) -> str:
        """Clean and format price text consistently."""
        if not price_text:
            return 'Check price'

        # Remove currency symbols and clean up
        cleaned = price_text.replace('$', '').replace(',', '').strip()

        # Handle price ranges (take the first price)
        if '-' in cleaned:
            cleaned = cleaned.split('-')[0].strip()
        elif 'to' in cleaned.lower():
            cleaned = cleaned.lower().split('to')[0].strip()

        # Try to parse as float
        try:
            price_float = float(cleaned)
            return f"${price_float:.2f}"
        except:
            # If parsing fails, return the original with $ added if needed
            if not price_text.startswith('$'):
                return f"${price_text}"
            return price_text

    def get_price_value(self, price_str: str) -> float:
        """Extract numeric value from price string for sorting."""
        if price_str == 'Check price' or price_str == 'N/A':
            return float('inf')  # Put these at the end

        # Remove $ and convert to float
        try:
            cleaned = price_str.replace('$', '').replace(',', '').strip()
            if '-' in cleaned:
                cleaned = cleaned.split('-')[0].strip()
            return float(cleaned)
        except:
            return float('inf')

    def get_price_tiers(self, item_type: str) -> Dict[str, Tuple[float, float]]:
        """Define price tiers based on item type."""
        item_type_lower = item_type.lower()

        # Shoes/Sneakers
        if any(word in item_type_lower for word in ['shoe', 'sneaker', 'boot', 'sandal']):
            return {
                'budget': (0, 50),
                'mid': (50, 100),
                'high': (100, 200),
                'ultra_high': (200, float('inf'))
            }

        # Jackets/Outerwear
        elif any(word in item_type_lower for word in ['jacket', 'coat', 'parka', 'windbreaker']):
            return {
                'budget': (0, 40),
                'mid': (40, 100),
                'high': (100, 200),
                'ultra_high': (200, float('inf'))
            }

        # Pants/Jeans
        elif any(word in item_type_lower for word in ['pant', 'jean', 'jogger', 'legging', 'tight']):
            return {
                'budget': (0, 30),
                'mid': (30, 70),
                'high': (70, 150),
                'ultra_high': (150, float('inf'))
            }

        # Shirts/Tops
        elif any(word in item_type_lower for word in ['shirt', 'tee', 'top', 'blouse', 'tank']):
            return {
                'budget': (0, 20),
                'mid': (20, 50),
                'high': (50, 100),
                'ultra_high': (100, float('inf'))
            }

        # Sports Bras
        elif any(word in item_type_lower for word in ['bra', 'sports bra']):
            return {
                'budget': (0, 25),
                'mid': (25, 50),
                'high': (50, 80),
                'ultra_high': (80, float('inf'))
            }

        # Shorts
        elif 'short' in item_type_lower:
            return {
                'budget': (0, 20),
                'mid': (20, 40),
                'high': (40, 80),
                'ultra_high': (80, float('inf'))
            }

        # Default for other items
        else:
            return {
                'budget': (0, 30),
                'mid': (30, 60),
                'high': (60, 120),
                'ultra_high': (120, float('inf'))
            }

    def categorize_by_price(self, products: List[Dict], item_type: str) -> Dict[str, List[Dict]]:
        """Categorize products into price tiers."""
        tiers = self.get_price_tiers(item_type)
        categorized = {
            'budget': [],
            'mid': [],
            'high': [],
            'ultra_high': []
        }

        for product in products:
            price_value = self.get_price_value(product['price'])

            if price_value <= tiers['budget'][1]:
                categorized['budget'].append(product)
            elif price_value <= tiers['mid'][1]:
                categorized['mid'].append(product)
            elif price_value <= tiers['high'][1]:
                categorized['high'].append(product)
            else:
                categorized['ultra_high'].append(product)

        # Sort each tier by price
        for tier in categorized:
            categorized[tier].sort(key=lambda x: self.get_price_value(x['price']))

        return categorized

    def search_google_shopping(self, queries: List[str], price_filters: Dict[str, str] = None) -> List[Dict]:
        """Search Google Shopping with multiple queries and optional price filters."""
        if not self.serp_api_key:
            return []

        all_products = []
        seen_products = set()  # Track unique products

        for query in queries:
            params = {
                "api_key": self.serp_api_key,
                "engine": "google_shopping",
                "q": query,
                "location": "United States",
                "hl": "en",
                "gl": "us",
                "num": "40",  # Get maximum results
                "filter": "0"  # Show all results including out of stock
            }

            # Add price filters if specified
            if price_filters:
                if 'min_price' in price_filters:
                    params['tbs'] = f"mr:1,price:1,ppr_min:{price_filters['min_price']}"
                if 'max_price' in price_filters:
                    params['tbs'] = params.get('tbs', '') + f",ppr_max:{price_filters['max_price']}"

            try:
                search = GoogleSearch(params)
                results = search.get_dict()

                for product in results.get("shopping_results", []):
                    # Create unique identifier
                    product_key = f"{product.get('title', '')}_{product.get('source', '')}"

                    if product_key not in seen_products:
                        seen_products.add(product_key)

                        product_id = product.get("product_id") or product.get("id", "")

                        # Get direct link if available
                        product_link = product.get("link", "")
                        if not product_link and product_id:
                            product_link = f"https://www.google.com/shopping/product/{product_id}?gl=us"

                        all_products.append({
                            'source': 'google_shopping',
                            'name': product.get("title", ""),
                            'price': self.clean_price(product.get("price", "N/A")),
                            'store': product.get("source", "Unknown"),
                            'product_url': product_link,
                            'image_url': product.get("thumbnail", ""),
                            'rating': product.get("rating"),
                            'reviews': product.get("reviews"),
                            'delivery': product.get("delivery"),
                            'in_stock': product.get("in_stock", True)
                        })

            except Exception as e:
                print(f"    ⚠️ Error searching Google Shopping: {e}")

        return all_products

    def search_with_web_scraping(self, query: str) -> List[Dict]:
        """Fallback web scraping for additional results."""
        products = []

        try:
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }

            # Search multiple shopping aggregators
            search_urls = [
                f"https://www.google.com/search?q={urllib.parse.quote(query)}+buy+online+USA&tbm=shop",
                f"https://www.bing.com/shop?q={urllib.parse.quote(query)}",
            ]

            for url in search_urls:
                response = requests.get(url, headers=headers, timeout=5)
                if response.status_code == 200:
                    soup = BeautifulSoup(response.content, 'html.parser')
                    # Basic extraction - this would need to be more sophisticated
                    # Just a placeholder for the concept
                    pass

        except:
            pass

        return products

    def find_products_comprehensive(self, item: Dict) -> List[Dict]:
        """Comprehensive product search across all possible sources."""
        all_products = []

        print("\n🔍 Searching across all retailers and marketplaces...")

        # 1. Main queries
        main_queries = item.get('search_queries', [])

        # 2. Budget-specific queries
        budget_queries = item.get('budget_queries', [])

        # 3. Premium-specific queries
        premium_queries = item.get('premium_queries', [])

        # 4. Size-specific queries if size is mentioned
        size = item['attributes'].get('size', '')
        if size:
            main_queries = [f"{q} size {size}" for q in main_queries]

        # Search with different price filters to ensure coverage
        print("  📊 Searching all price ranges...")

        # Budget searches
        print("    💰 Finding budget options...")
        budget_results = self.search_google_shopping(
            main_queries + budget_queries,
            {'max_price': '50'}
        )
        all_products.extend(budget_results)

        # Mid-range searches
        print("    💎 Finding mid-range options...")
        mid_results = self.search_google_shopping(
            main_queries,
            {'min_price': '50', 'max_price': '150'}
        )
        all_products.extend(mid_results)

        # High-end searches
        print("    👑 Finding high-end options...")
        high_results = self.search_google_shopping(
            main_queries,
            {'min_price': '150', 'max_price': '300'}
        )
        all_products.extend(high_results)

        # Luxury searches
        print("    🏆 Finding luxury options...")
        luxury_results = self.search_google_shopping(
            main_queries + premium_queries,
            {'min_price': '300'}
        )
        all_products.extend(luxury_results)

        # General search without price filters for comprehensive coverage
        print("    🔍 Final comprehensive search...")
        general_results = self.search_google_shopping(main_queries)
        all_products.extend(general_results)

        # Remove duplicates while preserving order
        seen = set()
        unique_products = []
        for product in all_products:
            # Create a unique key based on name and store
            key = f"{product['name'][:50].lower()}_{product['store'].lower()}"
            if key not in seen and product['name']:
                seen.add(key)
                unique_products.append(product)

        print(
            f"  ✅ Found {len(unique_products)} unique products from {len(set(p['store'] for p in unique_products))} different stores")

        return unique_products

    def find_products_from_description(self, description: str) -> Dict:
        """Main method to find products from text description."""
        print(f"\n{'=' * 60}")
        print(f"🛍️  UNIVERSAL CLOTHING FINDER")
        print(f"{'=' * 60}")

        start_time = time.time()

        print("\n📝 Analyzing your description...")
        print(f"   \"{description}\"")

        items = self.parse_clothing_description(description)

        if not items:
            return {"error": "Could not parse clothing items from description"}

        print(f"\n✅ Found {len(items)} items:")
        for i, item in enumerate(items, 1):
            print(f"\n{i}. {item['item_type'].upper()}")
            attrs = item['attributes']
            print(f"   • Color: {attrs.get('color', 'Not specified')}")
            print(f"   • Style: {attrs.get('style', 'Not specified')}")
            if attrs.get('size'):
                print(f"   • Size: {attrs.get('size')}")

        all_results = {
            "timestamp": datetime.now().isoformat(),
            "description": description,
            "items": []
        }

        print(f"\n{'=' * 60}")
        print(f"🔍 SEARCHING ALL RETAILERS & MARKETPLACES...")
        print(f"{'=' * 60}")

        for idx, item in enumerate(items, 1):
            print(f"\n📦 Item {idx}: {item['item_type']}")

            # Find products from all possible sources
            all_products = self.find_products_comprehensive(item)

            # Categorize by price tiers
            categorized_products = self.categorize_by_price(all_products, item['item_type'])

            # Display results by tier
            print(f"\n✅ Found {len(all_products)} total products across all price tiers:")

            tier_names = {
                'budget': '💰 BUDGET',
                'mid': '💎 MID-RANGE',
                'high': '👑 HIGH-END',
                'ultra_high': '🏆 ULTRA HIGH-END'
            }

            tiers = self.get_price_tiers(item['item_type'])

            # Show store diversity
            all_stores = list(set(p['store'] for p in all_products))
            print(f"\n📍 Products found from {len(all_stores)} different retailers")

            for tier_key, tier_label in tier_names.items():
                tier_products = categorized_products[tier_key]
                price_range = tiers[tier_key]
                if price_range[1] == float('inf'):
                    range_str = f"${price_range[0]}+"
                else:
                    range_str = f"${price_range[0]}-${price_range[1]}"

                print(f"\n  {tier_label} ({range_str}):")

                if tier_products:
                    # Show store diversity in this tier
                    tier_stores = list(set(p['store'] for p in tier_products))
                    print(f"    📍 {len(tier_products)} products from {len(tier_stores)} stores")

                    for j, product in enumerate(tier_products[:3], 1):  # Show top 3 per tier
                        print(f"    {j}. {product['name'][:50]}...")
                        print(f"       💵 {product['price']} at {product['store']}")
                        if product.get('rating'):
                            print(f"       ⭐ {product['rating']}/5 ({product.get('reviews', 0)} reviews)")
                        url = product.get('product_url', '')
                        if url and url not in ['', 'Check']:
                            print(f"       🔗 {url}")
                else:
                    print(f"    ❌ No products found in this price range")

            all_results["items"].append({
                "item_details": item,
                "products_found": all_products,
                "products_by_tier": categorized_products,
                "stores_found": all_stores
            })

        elapsed = time.time() - start_time
        print(f"\n✅ Search completed in {elapsed:.1f} seconds!")

        return all_results

    def generate_html_output(self, results: Dict, output_filename: str = None) -> str:
        """Generate beautiful HTML file with shopping links organized by price tiers."""
        if output_filename is None:
            output_filename = f"shopping_links_{datetime.now().strftime('%Y%m%d_%H%M%S')}.html"

        html_content = """
        <html>
        <head>
            <title>Shopping Links - Your Clothing Matches</title>
            <style>
                body { 
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; 
                    margin: 0;
                    padding: 20px;
                    background: #f5f5f5;
                }
                .container {
                    max-width: 1200px;
                    margin: 0 auto;
                    background: white;
                    padding: 30px;
                    border-radius: 10px;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                }
                h1 { 
                    color: #333; 
                    margin-bottom: 10px;
                }
                .subtitle {
                    color: #666;
                    font-size: 14px;
                    margin-bottom: 30px;
                }
                .description-box {
                    background: #e8f4fd;
                    border: 1px solid #bee5ff;
                    padding: 15px;
                    border-radius: 5px;
                    margin-bottom: 30px;
                    font-style: italic;
                }
                .store-summary {
                    background: #f0f8ff;
                    padding: 15px;
                    border-radius: 5px;
                    margin-bottom: 20px;
                    font-size: 14px;
                }
                h2 { 
                    color: #444; 
                    margin-top: 40px;
                    border-bottom: 2px solid #eee;
                    padding-bottom: 10px;
                }
                h3 {
                    color: #333;
                    margin-top: 30px;
                    margin-bottom: 15px;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }
                .tier-icon {
                    font-size: 24px;
                }
                .price-range {
                    font-size: 14px;
                    color: #666;
                    font-weight: normal;
                }
                .tier-section {
                    margin-bottom: 40px;
                    padding: 20px;
                    background: #fafafa;
                    border-radius: 8px;
                    border: 1px solid #eee;
                }
                .tier-section.budget {
                    background: #f0f8ff;
                    border-color: #bee5ff;
                }
                .tier-section.mid {
                    background: #f5f0ff;
                    border-color: #e0d0ff;
                }
                .tier-section.high {
                    background: #fff8f0;
                    border-color: #ffe0b0;
                }
                .tier-section.ultra-high {
                    background: #fffaf0;
                    border-color: #ffd700;
                }
                .product-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
                    gap: 20px;
                    margin-top: 20px;
                }
                .product-card {
                    border: 1px solid #ddd;
                    border-radius: 8px;
                    padding: 20px;
                    transition: all 0.2s;
                    background: white;
                    position: relative;
                }
                .product-card:hover {
                    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
                    transform: translateY(-2px);
                }
                .store-badge {
                    position: absolute;
                    top: 10px;
                    right: 10px;
                    background: #666;
                    color: white;
                    padding: 4px 8px;
                    border-radius: 3px;
                    font-size: 11px;
                    font-weight: bold;
                }
                .product-image {
                    width: 100%;
                    height: 200px;
                    object-fit: contain;
                    margin-bottom: 15px;
                    background: white;
                    border-radius: 5px;
                }
                .product-name {
                    font-weight: 600;
                    color: #333;
                    margin-bottom: 8px;
                    line-height: 1.4;
                    min-height: 50px;
                }
                .price { 
                    color: #008800; 
                    font-weight: bold;
                    font-size: 20px;
                    margin: 8px 0;
                }
                .store { 
                    color: #666;
                    font-size: 14px;
                    margin-bottom: 8px;
                }
                .rating {
                    color: #f39c12;
                    font-size: 14px;
                    margin-bottom: 8px;
                }
                .button {
                    display: inline-block;
                    background: #0066cc;
                    color: white;
                    padding: 12px 24px;
                    text-decoration: none;
                    border-radius: 5px;
                    font-size: 14px;
                    font-weight: 500;
                    transition: background 0.2s;
                    text-align: center;
                    width: 100%;
                    box-sizing: border-box;
                }
                .button:hover {
                    opacity: 0.9;
                }
                .delivery-info {
                    font-size: 12px;
                    color: #666;
                    margin-top: 8px;
                    text-align: center;
                }
                .item-description {
                    color: #666;
                    font-size: 14px;
                    margin-bottom: 20px;
                    padding: 15px;
                    background: #f9f9f9;
                    border-radius: 5px;
                    border-left: 4px solid #0066cc;
                }
                .no-products {
                    text-align: center;
                    color: #999;
                    padding: 20px;
                    font-style: italic;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🛍️ Shopping Links for Your Clothing</h1>
                <p class="subtitle">Found the best options from retailers across the USA!</p>
                <div class="description-box">
                    <strong>Your search:</strong> "DESCRIPTION_PLACEHOLDER"
                </div>
        """

        # Replace the placeholder with the actual description
        html_content = html_content.replace('DESCRIPTION_PLACEHOLDER', results.get('description', ''))

        # Build the product sections
        for item_result in results['items']:
            item_details = item_result['item_details']
            item_name = item_details['item_type']
            attrs = item_details['attributes']
            products_by_tier = item_result.get('products_by_tier', {})
            stores_found = item_result.get('stores_found', [])

            html_content += f"""
                <h2>{item_name.upper()}</h2>
                <div class="item-description">
                    <strong>What we're looking for:</strong> {attrs.get('color', 'Any color')} {attrs.get('style', 'style')}
                    {f" - {attrs.get('material', '')}" if attrs.get('material') else ""}
                    {f" ({attrs.get('fit', '')} fit)" if attrs.get('fit') else ""}
                    {f" - Size {attrs.get('size')}" if attrs.get('size') else ""}
                </div>
                <div class="store-summary">
                    📍 Found products from <strong>{len(stores_found)}</strong> different retailers including: {', '.join(stores_found[:10])}{'...' if len(stores_found) > 10 else ''}
                </div>
            """

            tier_info = {
                'budget': {'icon': '💰', 'label': 'Budget Options'},
                'mid': {'icon': '💎', 'label': 'Mid-Range Options'},
                'high': {'icon': '👑', 'label': 'High-End Options'},
                'ultra_high': {'icon': '🏆', 'label': 'Ultra High-End Options'}
            }

            tiers = self.get_price_tiers(item_name)

            # Always show all tiers, even if empty
            for tier_key, tier_data in tier_info.items():
                tier_products = products_by_tier.get(tier_key, [])
                price_range = tiers[tier_key]
                if price_range[1] == float('inf'):
                    range_str = f"${price_range[0]:g}+"
                else:
                    range_str = f"${price_range[0]:g}-${price_range[1]:g}"

                html_content += f"""
                    <div class="tier-section {tier_key.replace('_', '-')}">
                        <h3>
                            <span class="tier-icon">{tier_data['icon']}</span>
                            {tier_data['label']}
                            <span class="price-range">({range_str})</span>
                        </h3>
                """

                if tier_products:
                    html_content += '<div class="product-grid">'

                    for product in tier_products[:12]:  # Show up to 12 products per tier
                        name = product['name']
                        price = product['price']
                        store = product['store']
                        url = product.get('product_url', '')
                        image_url = product.get('image_url', '')
                        rating = product.get('rating')
                        reviews = product.get('reviews', 0)
                        delivery = product.get('delivery', '')

                        if url and 'http' in url:
                            html_content += f'''
                                <div class="product-card">
                                    <div class="store-badge">{store}</div>
                                    {f'<img src="{image_url}" class="product-image" alt="{name}" onerror="this.style.display=\'none\'">' if image_url else ''}
                                    <div class="product-name">{name}</div>
                                    <div class="price">{price}</div>
                                    <div class="store">from {store}</div>
                                    {f'<div class="rating">⭐ {rating}/5 ({reviews} reviews)</div>' if rating else ''}
                                    <a href="{url}" target="_blank" class="button">
                                        Shop Now →
                                    </a>
                                    {f'<div class="delivery-info">{delivery}</div>' if delivery else ''}
                                </div>
                            '''

                    html_content += '</div>'
                else:
                    html_content += '<div class="no-products">No products found in this price range</div>'

                html_content += '</div>'

        html_content += """
                <div style="margin-top: 50px; padding: 20px; background: #f0f8ff; border-radius: 5px;">
                    <h3 style="margin-top: 0;">🎯 Shopping Tips</h3>
                    <p style="margin: 10px 0;">• Prices shown are from various retailers across the USA</p>
                    <p style="margin: 10px 0;">• Click "Shop Now" to view the product on the retailer's website</p>
                    <p style="margin: 10px 0;">• Some retailers may offer additional discounts or free shipping</p>
                    <p style="margin: 10px 0;">• Check multiple options in your price range for the best deal</p>
                </div>
            </div>
        </body>
        </html>
        """

        # Write to file
        with open(output_filename, 'w', encoding='utf-8') as f:
            f.write(html_content)

        return output_filename


def main():
    """Run the text-based clothing finder."""
    # Config - Replace with your actual API keys
    anthropic_api_key = "REDACTED_API_KEY"
    serp_api_key = "916e1d87e21b94691beeba4113818348b063f7703fbab10aaec25d948dd6724a"

    # Example descriptions with sizes
    descriptions = [
        "black Nike running shoes with white swoosh, men's size 11, preferably Air Max or React model with good cushioning",
        "dark blue slim fit denim jeans size 32x32 with slight stretch, and white cotton crew neck t-shirt size large",
        "red Adidas tracksuit with white three stripes, men's medium jacket and medium pants, polyester material",
        "women's high-waisted athletic leggings size small with side pockets and matching sports bra size small in navy blue, moisture-wicking fabric"
    ]

    # Create finder
    finder = TextClothingFinder(anthropic_api_key, serp_api_key)

    # Process each description
    for description in descriptions[:1]:  # Process first description as example
        print(f"\n{'=' * 80}")
        print(f"PROCESSING: {description}")
        print(f"{'=' * 80}")

        # Find products
        results = finder.find_products_from_description(description)

        # Save results as JSON
        output_file = f"clothing_results_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        with open(output_file, 'w') as f:
            json.dump(results, f, indent=2)

        print(f"\n💾 Full results saved to: {output_file}")

        # Generate HTML output
        html_file = finder.generate_html_output(results)
        print(f"\n🔗 Clickable links saved to: {html_file}")
        print("   Open this HTML file in your browser for direct shopping links!")


if __name__ == "__main__":
    main()