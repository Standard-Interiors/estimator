# practical_clothing_finder.py

import base64
import io
import json
import os
import re
import time
from datetime import datetime
from typing import Dict, List, Optional
import concurrent.futures
import urllib.parse

import anthropic
import requests
from PIL import Image
from serpapi import GoogleSearch
from bs4 import BeautifulSoup
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options


class PracticalClothingFinder:
    def __init__(self, anthropic_key: str, serp_api_key: str = None):
        """Initialize with just the essentials."""
        self.client = anthropic.Anthropic(api_key=anthropic_key)
        self.serp_api_key = serp_api_key

        # Setup headless Chrome for scraping
        self.chrome_options = Options()
        self.chrome_options.add_argument('--headless')
        self.chrome_options.add_argument('--no-sandbox')
        self.chrome_options.add_argument('--disable-dev-shm-usage')
        self.chrome_options.add_argument('--disable-blink-features=AutomationControlled')
        self.chrome_options.add_experimental_option("excludeSwitches", ["enable-automation"])
        self.chrome_options.add_experimental_option('useAutomationExtension', False)
        self.chrome_options.add_argument(
            '--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')

    def _encode_image(self, image_path: str) -> tuple[str, str]:
        """Convert image to base64."""
        with open(image_path, 'rb') as image_file:
            image_data = image_file.read()

        image = Image.open(io.BytesIO(image_data))
        media_type = f"image/{image.format.lower()}"
        base64_image = base64.b64encode(image_data).decode('utf-8')

        return base64_image, media_type

    def analyze_clothing_smart(self, image_path: str) -> List[Dict]:
        """Smart analysis with search-optimized output."""
        base64_image, media_type = self._encode_image(image_path)

        prompt = """
        Analyze the clothing and create search strategies. For each item, provide:

        1. Multiple search queries from specific to general
        2. Key attributes for filtering results
        3. Price range estimates
        4. Likely brands/retailers

        Return JSON:
        [
            {
                "item_type": "specific type",
                "attributes": {
                    "color": "exact color",
                    "style": "style description",
                    "material": "material type",
                    "fit": "fit type",
                    "length": "length if applicable",
                    "pattern": "pattern type"
                },
                "search_queries": [
                    "most specific query with all details",
                    "medium specificity query",
                    "general fallback query"
                ],
                "filters": {
                    "gender": "mens/womens/unisex",
                    "category": "tops/bottoms/shoes/etc",
                    "price_range": [20, 100]
                },
                "shopping_keywords": ["key", "terms", "for", "shopping"],
                "likely_retailers": ["nike", "adidas", "underarmour", etc]
            }
        ]
        """

        response = self.client.messages.create(
            model="claude-opus-4-20250514",
            max_tokens=2000,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": base64_image}},
                    {"type": "text", "text": prompt}
                ]
            }]
        )

        json_match = re.search(r'\[.*\]', response.content[0].text, re.DOTALL)
        return json.loads(json_match.group()) if json_match else []

    def search_nike(self, item: Dict) -> List[Dict]:
        """Search Nike website using their API."""
        print("  👟 Searching Nike...")
        products = []
        query = ' '.join(item['shopping_keywords'][:3])

        try:
            headers = {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                'Accept': 'application/json',
                'Referer': 'https://www.nike.com/'
            }

            # Use Nike's search endpoint
            encoded_query = urllib.parse.quote(query)
            url = f"https://www.nike.com/search/products?q={encoded_query}"

            response = requests.get(url, headers=headers, timeout=10)

            if response.status_code == 200:
                # Parse Nike's product data
                soup = BeautifulSoup(response.content, 'html.parser')

                # Look for product data in script tags
                scripts = soup.find_all('script', type='application/ld+json')
                for script in scripts:
                    try:
                        data = json.loads(script.string)
                        if data.get('@type') == 'ItemList':
                            for item_elem in data.get('itemListElement', [])[:5]:
                                product = item_elem.get('item', {})
                                products.append({
                                    'source': 'nike_direct',
                                    'name': product.get('name', ''),
                                    'price': product.get('offers', {}).get('price', 'Check price'),
                                    'store': 'Nike',
                                    'product_url': product.get('url', ''),
                                    'image_url': product.get('image', '')
                                })
                    except:
                        pass

                # Fallback to HTML parsing if no JSON-LD
                if not products:
                    for product_card in soup.select('.product-card')[:5]:
                        try:
                            link = product_card.select_one('a')
                            title = product_card.select_one('.product-card__title')
                            price = product_card.select_one('.product-price')

                            if link and title:
                                href = link.get('href', '')
                                if not href.startswith('http'):
                                    href = f"https://www.nike.com{href}"

                                products.append({
                                    'source': 'nike_direct',
                                    'name': title.text.strip(),
                                    'price': price.text.strip() if price else 'Check price',
                                    'store': 'Nike',
                                    'product_url': href,
                                    'image_url': ''
                                })
                        except:
                            continue
        except Exception as e:
            print(f"    ❌ Nike search error: {e}")

        return products

    def search_adidas(self, item: Dict) -> List[Dict]:
        """Search Adidas using their API."""
        print("  👟 Searching Adidas...")
        products = []
        query = ' '.join(item['shopping_keywords'][:3])

        try:
            headers = {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                'Accept': 'application/json',
                'Referer': 'https://www.adidas.com/'
            }

            # Use Adidas API endpoint
            url = f"https://www.adidas.com/api/plp/content-engine/search?query={urllib.parse.quote(query)}"

            response = requests.get(url, headers=headers, timeout=10)

            if response.status_code == 200:
                data = response.json()
                raw_products = data.get('raw', {}).get('itemList', {}).get('items', [])

                for product in raw_products[:5]:
                    products.append({
                        'source': 'adidas_direct',
                        'name': product.get('displayName', ''),
                        'price': f"${product.get('price', 'N/A')}",
                        'store': 'Adidas',
                        'product_url': f"https://www.adidas.com{product.get('link', '')}",
                        'image_url': product.get('image', {}).get('src', '')
                    })
            else:
                # Fallback to HTML scraping
                return self._scrape_adidas_fallback(item)

        except Exception as e:
            print(f"    ❌ Adidas API error: {e}")
            return self._scrape_adidas_fallback(item)

        return products

    def _scrape_adidas_fallback(self, item: Dict) -> List[Dict]:
        """Fallback Adidas scraping without Selenium."""
        products = []
        query = '+'.join(item['shopping_keywords'][:3])

        try:
            headers = {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml'
            }

            url = f"https://www.adidas.com/us/search?q={query}"
            response = requests.get(url, headers=headers, timeout=10)
            soup = BeautifulSoup(response.content, 'html.parser')

            # Look for product cards
            for product in soup.select('[data-auto-id="product-card"]')[:5]:
                try:
                    link = product.select_one('a')
                    title = product.select_one('.glass-product-card__title')
                    price = product.select_one('.gl-price')

                    if link and title:
                        href = link.get('href', '')
                        if not href.startswith('http'):
                            href = f"https://www.adidas.com{href}"

                        products.append({
                            'source': 'adidas_direct',
                            'name': title.text.strip(),
                            'price': price.text.strip() if price else 'Check price',
                            'store': 'Adidas',
                            'product_url': href,
                            'image_url': ''
                        })
                except:
                    continue

        except:
            pass

        return products

    def search_underarmour(self, item: Dict) -> List[Dict]:
        """Search Under Armour website."""
        print("  👟 Searching Under Armour...")
        products = []
        query = '%20'.join(item['shopping_keywords'][:3])

        try:
            headers = {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml'
            }

            url = f"https://www.underarmour.com/en-us/search?q={query}"
            response = requests.get(url, headers=headers, timeout=10)
            soup = BeautifulSoup(response.content, 'html.parser')

            # Find products
            for product in soup.select('.tile, .product-tile, [data-testid="product-tile"]')[:5]:
                try:
                    link = product.select_one('a')
                    title = product.select_one('.tile-name, .product-name, [data-testid="product-name"]')
                    price = product.select_one('.tile-price, .product-price, [data-testid="product-price"]')

                    if link and title:
                        href = link.get('href', '')
                        if not href.startswith('http'):
                            href = f"https://www.underarmour.com{href}"

                        # Clean price
                        price_text = 'Check price'
                        if price:
                            price_text = price.text.strip()
                            # Extract first price if range
                            price_match = re.search(r'\$[\d.]+', price_text)
                            if price_match:
                                price_text = price_match.group()

                        products.append({
                            'source': 'underarmour_direct',
                            'name': title.text.strip(),
                            'price': price_text,
                            'store': 'Under Armour',
                            'product_url': href,
                            'image_url': ''
                        })
                except:
                    continue

        except Exception as e:
            print(f"    ❌ Under Armour error: {e}")

        return products

    def search_amazon(self, item: Dict) -> List[Dict]:
        """Search Amazon with better URL extraction."""
        print("  📦 Searching Amazon...")
        products = []
        query = '+'.join(item['shopping_keywords'])

        try:
            headers = {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1'
            }

            url = f"https://www.amazon.com/s?k={query}"
            response = requests.get(url, headers=headers, timeout=10)

            if response.status_code == 200:
                soup = BeautifulSoup(response.content, 'html.parser')

                # Find all product containers
                for product in soup.select('[data-component-type="s-search-result"]')[:5]:
                    try:
                        # Get ASIN from data attribute
                        asin = product.get('data-asin', '')

                        # Extract title
                        title_elem = product.select_one('h2.s-size-mini.s-spacing-none.s-spacing-top-small span')
                        if not title_elem:
                            title_elem = product.select_one('h2 span')

                        # Extract price
                        price_elem = product.select_one('.a-price-whole')
                        if not price_elem:
                            price_elem = product.select_one('.a-price .a-offscreen')

                        # Extract link
                        link_elem = product.select_one('h2 a.a-link-normal')

                        if title_elem and (asin or link_elem):
                            # Build product URL
                            if asin:
                                product_url = f"https://www.amazon.com/dp/{asin}"
                            elif link_elem:
                                href = link_elem.get('href', '')
                                if href.startswith('/'):
                                    product_url = f"https://www.amazon.com{href}"
                                else:
                                    product_url = href
                            else:
                                continue

                            # Clean price
                            price_text = 'Check price'
                            if price_elem:
                                price_text = price_elem.text.strip()
                                if not price_text.startswith('$'):
                                    price_text = f"${price_text}"
                                # Remove decimal if it's there
                                price_text = price_text.replace('$', '').replace(',', '')
                                try:
                                    price_float = float(price_text.replace('.', '').replace(' ', '')) / 100
                                    price_text = f"${price_float:.2f}"
                                except:
                                    price_text = f"${price_text}"

                            # Get image
                            image_elem = product.select_one('img.s-image')
                            image_url = image_elem.get('src', '') if image_elem else ''

                            products.append({
                                'source': 'amazon_direct',
                                'name': title_elem.text.strip()[:100],
                                'price': price_text,
                                'store': 'Amazon',
                                'product_url': product_url,
                                'image_url': image_url
                            })
                    except Exception as e:
                        continue

        except Exception as e:
            print(f"    ❌ Amazon search error: {e}")

        return products

    def search_dicks_sporting_goods(self, item: Dict) -> List[Dict]:
        """Search Dick's Sporting Goods."""
        print("  🏃 Searching Dick's Sporting Goods...")
        products = []
        query = '%20'.join(item['shopping_keywords'][:3])

        try:
            headers = {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml'
            }

            url = f"https://www.dickssportinggoods.com/search/SearchDisplay?searchTerm={query}"
            response = requests.get(url, headers=headers, timeout=10)
            soup = BeautifulSoup(response.content, 'html.parser')

            # Find products
            for product in soup.select('.dsg-product-tile')[:5]:
                try:
                    link = product.select_one('a.dsg-product-title-link')
                    title = product.select_one('.dsg-product-title')
                    price = product.select_one('.dsg-price')

                    if link and title:
                        href = link.get('href', '')
                        if not href.startswith('http'):
                            href = f"https://www.dickssportinggoods.com{href}"

                        products.append({
                            'source': 'dicks_direct',
                            'name': title.text.strip(),
                            'price': price.text.strip() if price else 'Check price',
                            'store': "Dick's Sporting Goods",
                            'product_url': href,
                            'image_url': ''
                        })
                except:
                    continue

        except Exception as e:
            print(f"    ❌ Dick's error: {e}")

        return products

    def search_walmart(self, item: Dict) -> List[Dict]:
        """Search Walmart using their API."""
        print("  🛒 Searching Walmart...")
        products = []
        query = ' '.join(item['shopping_keywords'])

        try:
            headers = {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                'Accept': 'application/json'
            }

            # Use Walmart's search API
            url = f"https://www.walmart.com/orchestra/home/graphql/search"

            # This is a simplified version - Walmart's actual API is more complex
            # Fallback to HTML scraping
            url = f"https://www.walmart.com/search?q={urllib.parse.quote(query)}"
            response = requests.get(url, headers=headers, timeout=10)
            soup = BeautifulSoup(response.content, 'html.parser')

            # Look for product data in script tags
            scripts = soup.find_all('script', type='application/ld+json')
            for script in scripts:
                try:
                    data = json.loads(script.string)
                    if data.get('@type') == 'ItemList':
                        for item_elem in data.get('itemListElement', [])[:5]:
                            product = item_elem.get('item', {})
                            products.append({
                                'source': 'walmart_direct',
                                'name': product.get('name', ''),
                                'price': f"${product.get('offers', {}).get('price', 'N/A')}",
                                'store': 'Walmart',
                                'product_url': product.get('url', ''),
                                'image_url': product.get('image', '')
                            })
                except:
                    pass

        except Exception as e:
            print(f"    ❌ Walmart error: {e}")

        return products

    def search_target(self, item: Dict) -> List[Dict]:
        """Search Target using their API."""
        print("  🎯 Searching Target...")
        products = []
        query = ' '.join(item['shopping_keywords'])

        try:
            url = "https://redsky.target.com/redsky_aggregations/v1/web/plp_search_v2"
            params = {
                'keyword': query,
                'count': 24,
                'offset': 0,
                'default_purchasability_filter': 'true',
                'pricing_store_id': '3284'
            }

            response = requests.get(url, params=params, timeout=10)

            if response.status_code == 200:
                data = response.json()

                for product in data.get('data', {}).get('search', {}).get('products', [])[:5]:
                    try:
                        item_data = product['item']
                        price_data = product.get('price', {})

                        # Get product details
                        tcin = item_data.get('tcin', '')
                        title = item_data.get('product_description', {}).get('title', '')

                        # Build URL
                        if tcin:
                            product_url = f"https://www.target.com/p/-/A-{tcin}"
                        else:
                            buy_url = item_data.get('enrichment', {}).get('buy_url', '')
                            product_url = f"https://www.target.com{buy_url}" if buy_url else ''

                        products.append({
                            'source': 'target_direct',
                            'name': title[:100],
                            'price': f"${price_data.get('reg_retail', 'N/A')}",
                            'store': 'Target',
                            'product_url': product_url,
                            'image_url': item_data.get('enrichment', {}).get('images', {}).get('primary_image_url', '')
                        })
                    except:
                        continue

        except Exception as e:
            print(f"    ❌ Target error: {e}")

        return products

    def search_google_shopping(self, item: Dict) -> List[Dict]:
        """Google Shopping as a fallback option."""
        if not self.serp_api_key:
            return []

        all_products = []
        query = item['search_queries'][0]

        print(f"  🔍 Checking Google Shopping for additional options...")

        params = {
            "api_key": self.serp_api_key,
            "engine": "google_shopping",
            "q": query,
            "location": "United States",
            "hl": "en",
            "gl": "us",
            "num": "5"
        }

        try:
            search = GoogleSearch(params)
            results = search.get_dict()

            for product in results.get("shopping_results", [])[:5]:
                product_id = product.get("product_id") or product.get("id", "")
                google_shopping_url = f"https://www.google.com/shopping/product/{product_id}?gl=us" if product_id else ""

                all_products.append({
                    'source': 'google_shopping',
                    'name': product.get("title", ""),
                    'price': product.get("price", "N/A"),
                    'store': product.get("source", ""),
                    'product_url': google_shopping_url,
                    'image_url': product.get("thumbnail", ""),
                    'rating': product.get("rating"),
                    'reviews': product.get("reviews")
                })

        except:
            pass

        return all_products

    def search_major_retailers(self, item: Dict) -> List[Dict]:
        """Search major retailers with better error handling."""
        all_retailers = {
            'amazon': self.search_amazon,
            'nike': self.search_nike,
            'adidas': self.search_adidas,
            'underarmour': self.search_underarmour,
            'target': self.search_target,
            'walmart': self.search_walmart,
            'dickssportinggoods': self.search_dicks_sporting_goods
        }

        # Choose retailers based on item
        selected_retailers = ['amazon']  # Always include Amazon

        if 'athletic' in item['item_type'].lower() or 'running' in item['item_type'].lower():
            selected_retailers.extend(['nike', 'adidas', 'underarmour', 'dickssportinggoods'])

        if 'shoes' in item['item_type'].lower() or 'sneakers' in item['item_type'].lower():
            selected_retailers.extend(['nike', 'adidas'])

        # Add general retailers
        selected_retailers.extend(['target'])

        # Get unique retailers
        selected_retailers = list(dict.fromkeys(selected_retailers))[:6]

        all_products = []

        # Search retailers with better error handling
        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
            future_to_retailer = {
                executor.submit(all_retailers[retailer], item): retailer
                for retailer in selected_retailers if retailer in all_retailers
            }

            for future in concurrent.futures.as_completed(future_to_retailer):
                retailer = future_to_retailer[future]
                try:
                    products = future.result()
                    if products:
                        all_products.extend(products)
                        print(f"    ✅ Found {len(products)} products from {retailer}")
                except Exception as e:
                    print(f"    ❌ Error searching {retailer}: {e}")

        return all_products

    def find_similar_products(self, image_path: str) -> Dict:
        """Main method to find products."""
        print(f"\n{'=' * 60}")
        print(f"🛍️  PRACTICAL CLOTHING FINDER")
        print(f"{'=' * 60}")

        start_time = time.time()

        print("\n📸 Analyzing your clothing...")
        items = self.analyze_clothing_smart(image_path)

        if not items:
            return {"error": "No clothing items detected"}

        print(f"\n✅ Found {len(items)} items:")
        for i, item in enumerate(items, 1):
            print(f"\n{i}. {item['item_type'].upper()}")
            attrs = item['attributes']
            print(f"   • Color: {attrs['color']}")
            print(f"   • Style: {attrs['style']}")
            print(f"   • Search terms: {', '.join(item['shopping_keywords'])}")

        all_results = {
            "timestamp": datetime.now().isoformat(),
            "image_path": image_path,
            "items": []
        }

        print(f"\n{'=' * 60}")
        print(f"🔍 SEARCHING FOR PRODUCTS...")
        print(f"{'=' * 60}")

        for idx, item in enumerate(items, 1):
            print(f"\n📦 Item {idx}: {item['item_type']}")

            all_products = []

            # 1. FIRST: Search direct retailers
            print("\n🏪 Searching direct retailers...")
            retailer_products = self.search_major_retailers(item)
            all_products.extend(retailer_products)

            # 2. THEN: Add Google Shopping if needed
            if len(all_products) < 10 and self.serp_api_key:
                google_products = self.search_google_shopping(item)
                all_products.extend(google_products)

            # Remove duplicates
            seen_names = set()
            unique_products = []
            for product in all_products:
                name_key = product['name'][:50].lower()
                if name_key not in seen_names and product['name']:  # Ensure name exists
                    seen_names.add(name_key)
                    unique_products.append(product)

            # Sort by source priority
            source_priority = {
                'nike_direct': 0,
                'adidas_direct': 1,
                'underarmour_direct': 2,
                'amazon_direct': 3,
                'dicks_direct': 4,
                'target_direct': 5,
                'walmart_direct': 6,
                'google_shopping': 10
            }
            unique_products.sort(key=lambda x: source_priority.get(x['source'], 99))

            if unique_products:
                print(f"\n✅ Top matches:")
                for j, product in enumerate(unique_products[:5], 1):
                    print(f"\n  {j}. {product['name'][:60]}...")
                    print(f"     💰 {product['price']} at {product['store']}")
                    print(f"     📍 Found via: {product['source'].replace('_', ' ').title()}")

                    url = product.get('product_url', '')
                    if url and url not in ['', 'Check']:
                        if 'google.com/shopping' in url:
                            print(f"     🛒 {url} (comparison page)")
                        else:
                            print(f"     🛒 {url} (direct link)")
                    else:
                        print(f"     🛒 Search on {product['store']}")

            all_results["items"].append({
                "item_details": item,
                "products_found": unique_products[:15]
            })

        elapsed = time.time() - start_time
        print(f"\n✅ Search completed in {elapsed:.1f} seconds!")

        return all_results


def main():
    """Run the clothing finder."""
    # Config
    image_path = "/Users/william/fashion/src/IMG_5646.jpg"
    anthropic_api_key = "REDACTED_API_KEY"
    serp_api_key = "916e1d87e21b94691beeba4113818348b063f7703fbab10aaec25d948dd6724a"

    # Create finder
    finder = PracticalClothingFinder(anthropic_api_key, serp_api_key)

    # Find products
    results = finder.find_similar_products(image_path)

    # Save results as JSON
    output_file = f"clothing_results_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    with open(output_file, 'w') as f:
        json.dump(results, f, indent=2)

    print(f"\n💾 Full results saved to: {output_file}")

    # Create simple shopping list
    print("\n" + "=" * 60)
    print("🛒 QUICK SHOPPING LIST")
    print("=" * 60)
    print("Direct retailer links when available!")

    for item_result in results['items']:
        item_name = item_result['item_details']['item_type']
        print(f"\n{item_name.upper()}:")

        direct_count = 0
        for i, product in enumerate(item_result['products_found'][:5], 1):
            is_direct = 'direct' in product.get('source', '')
            icon = "🔗" if is_direct else "🔍"

            print(f"  {i}. {icon} {product['name'][:50]}... - {product['price']} at {product['store']}")
            url = product.get('product_url', '')
            if url and 'http' in url:
                if is_direct:
                    print(f"     → {url}")
                    direct_count += 1
                else:
                    print(f"     → {url} (via Google Shopping)")

        print(f"     ({direct_count} direct links found)")

    # Create beautiful HTML file
    links_file = f"shopping_links_{datetime.now().strftime('%Y%m%d_%H%M%S')}.html"
    with open(links_file, 'w') as f:
        f.write("""
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
                h2 { 
                    color: #444; 
                    margin-top: 40px;
                    border-bottom: 2px solid #eee;
                    padding-bottom: 10px;
                }
                .stats {
                    background: #f0f8ff;
                    padding: 10px 15px;
                    border-radius: 5px;
                    margin-bottom: 20px;
                    font-size: 14px;
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
                    background: #fafafa;
                    position: relative;
                }
                .product-card.direct {
                    border-color: #4CAF50;
                    background: #f8fff8;
                }
                .product-card:hover {
                    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
                    transform: translateY(-2px);
                }
                .direct-badge {
                    position: absolute;
                    top: 10px;
                    right: 10px;
                    background: #4CAF50;
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
                    margin-bottom: 12px;
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
                .button.direct {
                    background: #4CAF50;
                }
                .button:hover {
                    opacity: 0.9;
                }
                .source-note {
                    font-size: 11px;
                    color: #999;
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
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🛍️ Shopping Links for Your Clothing</h1>
                <p class="subtitle">Direct retailer links are prioritized. Click to go straight to the product!</p>
        """)

        for item_result in results['items']:
            item_details = item_result['item_details']
            item_name = item_details['item_type']
            attrs = item_details['attributes']

            # Count direct links
            direct_links = sum(1 for p in item_result['products_found'] if 'direct' in p.get('source', ''))
            total_links = len(item_result['products_found'])

            f.write(f"""
                <h2>{item_name.upper()}</h2>
                <div class="item-description">
                    <strong>What we found:</strong> {attrs['color']} {attrs['style']}
                    {f" - {attrs.get('material', '')}" if attrs.get('material') else ""}
                    {f" ({attrs.get('fit', '')} fit)" if attrs.get('fit') else ""}
                </div>
                <div class="stats">
                    📊 Found {direct_links} direct retailer links and {total_links - direct_links} comparison links
                </div>
                <div class="product-grid">
            """)

            for i, product in enumerate(item_result['products_found'][:12], 1):
                name = product['name']
                price = product['price']
                store = product['store']
                url = product.get('product_url', '')
                image_url = product.get('image_url', '')
                source = product.get('source', '')
                is_direct = 'direct' in source

                if url and 'http' in url:
                    card_class = 'product-card direct' if is_direct else 'product-card'
                    button_class = 'button direct' if is_direct else 'button'

                    f.write(f'''
                        <div class="{card_class}">
                            {f'<div class="direct-badge">DIRECT LINK</div>' if is_direct else ''}
                            {f'<img src="{image_url}" class="product-image" alt="{name}" onerror="this.style.display=\'none\'">' if image_url else ''}
                            <div class="product-name">{name}</div>
                            <div class="price">{price}</div>
                            <div class="store">at {store}</div>
                            <a href="{url}" target="_blank" class="{button_class}">
                                {'Buy Now →' if is_direct else 'Compare Prices →'}
                            </a>
                            <div class="source-note">
                                {'Direct from retailer' if is_direct else 'Via Google Shopping comparison'}
                            </div>
                        </div>
                    ''')

            f.write("</div>")

        f.write("""
                <div style="margin-top: 50px; padding: 20px; background: #f0f8ff; border-radius: 5px;">
                    <h3 style="margin-top: 0;">🎯 Shopping Tips</h3>
                    <p style="margin: 10px 0;">• <strong>Direct links</strong> (green) take you straight to the product - fastest checkout!</p>
                    <p style="margin: 10px 0;">• <strong>Google Shopping links</strong> (blue) let you compare prices across sellers</p>
                    <p style="margin: 10px 0;">• Direct links are from Nike, Adidas, Amazon, Target, and other major retailers</p>
                </div>
            </div>
        </body>
        </html>
        """)

    print(f"\n🔗 Clickable links saved to: {links_file}")
    print("   Open this HTML file in your browser for direct shopping links!")
    print("\n💚 Look for direct retailer links - they take you straight to checkout!")


if __name__ == "__main__":
    main()