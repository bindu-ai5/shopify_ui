// Catalog Agent API Integration for Shopify UI
// ==============================================
// Use BACKEND_URL (api_server) to avoid CORS/mixed-content when UI runs on GitHub Pages.
// When BACKEND_URL is set, all requests go through the backend proxy.

const CATALOG_API = {
    // Backend proxy (api_server.py) — required for Shopify: tokens stay on the server only.
    BACKEND_URL: null,  // e.g. 'https://your-api.example.com' - set via setBackendUrl()
    // Direct catalog agent (only when same-origin or CORS allows; no Shopify Admin token in browser)
    BASE_URL: 'http://13.218.58.17',
    SHOPIFY_STORE: null,
};

class CatalogAgentAPI {
    constructor() {
        this.backendUrl = CATALOG_API.BACKEND_URL;
        this.baseUrl = CATALOG_API.BASE_URL;
        this.currentJobId = null;
        this.shopifyStore = null;
    }
    
    setBackendUrl(url) {
        this.backendUrl = url;
        CATALOG_API.BACKEND_URL = url;
    }
    
    /** Optional: shop domain from ?shop= (display / embedded app). Never pass Admin tokens here. */
    setShopDomain(store) {
        this.shopifyStore = store || null;
        CATALOG_API.SHOPIFY_STORE = store || null;
    }
    
    // ========================================
    // Shopify Operations (via backend only — no shpat_ in the browser)
    // ========================================
    
    async getShopifyProducts(limit = 50) {
        if (!this.backendUrl) {
            throw new Error(
                'Set a Backend URL in Settings. Shopify Admin API tokens must not be stored or used in the browser.'
            );
        }
        const base = this.backendUrl.replace(/\/$/, '');
        const response = await fetch(`${base}/api/products?limit=${encodeURIComponent(limit)}`);
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(data.error || `Failed to fetch products: ${response.statusText}`);
        }
        return data.products || [];
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
    
    // ========================================
    // Complete Workflow
    // ========================================
    
    async enrichAndWriteback(onProgress, options = {}) {
        try {
            if (!this.backendUrl) {
                throw new Error(
                    'Set a Backend URL in Settings. Enrichment must run through your server so Shopify tokens are not exposed in the browser.'
                );
            }
            const url = `${this.backendUrl.replace(/\/$/, '')}/api/run-enrichment`;
            const body = { limit: options.limit || 50, demo: !!options.demo };
            onProgress({ step: 'fetch', message: body.demo ? 'Running in demo mode (using existing data)...' : 'Starting enrichment via backend...' });
            const resp = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const data = await resp.json();
            if (!resp.ok) {
                const msg = data.error || `Backend error: ${resp.status}`;
                const detail = data.detail ? ` (${data.detail})` : '';
                throw new Error(msg + detail);
            }
            const count = data.enriched_count || data.products_processed || 0;
            const msg = data.demo ? 'Demo complete! Writeback ran with existing before-after data.' : (data.message || `Enrichment complete! ${count} products processed`);
            onProgress({
                step: 'complete',
                message: msg,
                data: { success: true, ...data }
            });
            return { success: true, ...data };
        } catch (error) {
            onProgress({ step: 'error', message: error.message, error });
            throw error;
        }
    }
}

// Export for use in UI
const catalogAPI = new CatalogAgentAPI();
