// Catalog Agent API Integration for Shopify UI
// ==============================================

const CATALOG_API = {
    BASE_URL: 'http://54.211.133.171',
    // Note: Shopify credentials should be entered by the user or stored securely in backend
    SHOPIFY_STORE: null,  // Will be set by user
    SHOPIFY_TOKEN: null,  // Will be set by user
};

class CatalogAgentAPI {
    constructor() {
        this.baseUrl = CATALOG_API.BASE_URL;
        this.currentJobId = null;
        this.shopifyStore = null;
        this.shopifyToken = null;
    }
    
    // Set Shopify credentials (called after user enters them)
    setShopifyCredentials(store, token) {
        this.shopifyStore = store;
        this.shopifyToken = token;
        CATALOG_API.SHOPIFY_STORE = store;
        CATALOG_API.SHOPIFY_TOKEN = token;
    }
    
    // ========================================
    // Shopify Operations
    // ========================================
    
    async getShopifyProducts(limit = 50) {
        if (!this.shopifyStore || !this.shopifyToken) {
            throw new Error('Shopify credentials not set. Call setShopifyCredentials() first.');
        }
        
        const url = `https://${this.shopifyStore}/admin/api/2026-01/products.json?limit=${limit}`;
        const response = await fetch(url, {
            headers: {
                'X-Shopify-Access-Token': this.shopifyToken,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`Failed to fetch Shopify products: ${response.statusText}`);
        }
        
        const data = await response.json();
        return data.products;
    }
    
    // ========================================
    // Catalog Agent Operations  
    // ========================================
    
    async enrichProducts(products) {
        const productData = products.map(p => ({
            product_id: p.id,
            title: p.title,
            description: p.body_html || '',
            vendor: p.vendor || '',
            product_type: p.product_type || '',
            tags: p.tags || '',
        }));
        
        const formData = new FormData();
        formData.append('data', JSON.stringify(productData));
        formData.append('job_type', 'shopify_enrichment');
        
        const response = await fetch(`${this.baseUrl}/api/csv/start`, {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            throw new Error(`Enrichment failed: ${response.statusText}`);
        }
        
        const result = await response.json();
        this.currentJobId = result.job_id;
        
        return result;
    }
    
    async getJobProgress(jobId) {
        const response = await fetch(`${this.baseUrl}/api/progress/${jobId}`);
        
        if (!response.ok) {
            throw new Error(`Failed to get progress: ${response.statusText}`);
        }
        
        return await response.json();
    }
    
    async getResults(jobId, resultType = 'products') {
        const response = await fetch(`${this.baseUrl}/api/results/${resultType}?job_id=${jobId}`);
        
        if (!response.ok) {
            throw new Error(`Failed to get results: ${response.statusText}`);
        }
        
        return await response.json();
    }
}

// Export for use in UI
const catalogAPI = new CatalogAgentAPI();
