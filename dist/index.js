"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const path_1 = __importDefault(require("path"));
const api_1 = __importDefault(require("./routes/api"));
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3000;
// Security middleware
app.use((0, helmet_1.default)({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'"]
        }
    }
}));
// CORS configuration
app.use((0, cors_1.default)({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
// Body parsing
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
// Trust proxy for rate limiting (when behind nginx/cloudflare)
app.set('trust proxy', 1);
// Serve static files
app.use(express_1.default.static(path_1.default.join(__dirname, '../public')));
// API routes
app.use('/api/v1', api_1.default);
// Redirect /api to /api/v1 for convenience
app.use('/api', api_1.default);
// Landing page
app.get('/', (req, res) => {
    res.sendFile(path_1.default.join(__dirname, '../public/index.html'));
});
// API documentation endpoint
app.get('/docs', (req, res) => {
    res.sendFile(path_1.default.join(__dirname, '../public/docs.html'));
});
// 404 handler
app.use((req, res) => {
    res.status(404).json({
        error: 'Not Found',
        message: `Cannot ${req.method} ${req.path}`,
        availableEndpoints: [
            'GET /api/v1/scan/:domain - Full DNS intelligence scan',
            'GET /api/v1/dns/:domain - DNS records lookup',
            'GET /api/v1/propagation/:domain - Propagation check',
            'GET /api/v1/health/:domain - Zone health analysis',
            'GET /api/v1/subdomains/:domain - Subdomain enumeration',
            'GET /api/v1/whois/:domain - WHOIS lookup'
        ]
    });
});
// Error handler
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'production'
            ? 'An unexpected error occurred'
            : err.message
    });
});
// Start server
app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🌐 DNS Intelligence API Server                          ║
║                                                           ║
║   Running on http://localhost:${PORT}                       ║
║                                                           ║
║   Endpoints:                                              ║
║   • GET /api/v1/scan/:domain     - Full scan              ║
║   • GET /api/v1/dns/:domain      - DNS records            ║
║   • GET /api/v1/propagation/:domain - Propagation         ║
║   • GET /api/v1/health/:domain   - Zone health            ║
║   • GET /api/v1/subdomains/:domain - Subdomains           ║
║   • GET /api/v1/whois/:domain    - WHOIS lookup           ║
║                                                           ║
║   Rate Limit: 3 requests / 24 hours (free tier)           ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
  `);
});
exports.default = app;
//# sourceMappingURL=index.js.map