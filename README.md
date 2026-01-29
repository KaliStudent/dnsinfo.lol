# DNS Intel API

Lightning-fast DNS Intelligence & Propagation Checker API

## Features

- **⚡ Lightning Fast DNS Zone Display** - Pull complete DNS records via DNS-over-HTTPS
- **🌍 Global Propagation Check** - Verify DNS propagation across 7 major regions
- **🏥 Zone Health Analysis** - Identify misconfigurations with actionable recommendations
- **🔎 Subdomain Enumeration** - Discover subdomains via Certificate Transparency logs
- **📋 WHOIS Intelligence** - Registration details with privacy-aware summaries
- **🔌 RESTful API** - Simple JSON API for integration

## Quick Start

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Start server
npm start

# Development mode with hot reload
npm run dev
```

Server runs on `http://localhost:3000` by default.

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/v1/scan/:domain` | Full DNS intelligence scan |
| `GET /api/v1/dns/:domain` | DNS records lookup |
| `GET /api/v1/propagation/:domain` | Global propagation check |
| `GET /api/v1/health/:domain` | Zone health analysis |
| `GET /api/v1/subdomains/:domain` | Subdomain enumeration |
| `GET /api/v1/whois/:domain` | WHOIS lookup |
| `GET /api/v1/rate-limit` | Check rate limit status |

## Rate Limiting

- **Free Tier**: 3 requests per 24 hours (IP-based)
- **Premium**: Unlimited (requires API key in `Authorization: Bearer <key>` header)

## Example Usage

```bash
# Full scan
curl "http://localhost:3000/api/v1/scan/cloudflare.com"

# DNS records only
curl "http://localhost:3000/api/v1/dns/google.com?type=MX,TXT"

# Propagation check
curl "http://localhost:3000/api/v1/propagation/example.com"

# Zone health
curl "http://localhost:3000/api/v1/health/example.com"
```

## DNS Resolvers Used

- Google Public DNS (North America)
- Cloudflare DNS (Global Anycast)
- Quad9 DNS (Europe)
- DNS.SB (Asia Pacific)
- AdGuard DNS (Global)
- NextDNS (Global)
- Control D (Global)

## Project Structure

```
dns-intel-api/
├── src/
│   ├── index.ts           # Express server setup
│   ├── routes/
│   │   └── api.ts         # API route handlers
│   ├── services/
│   │   ├── dnsResolver.ts # DNS-over-HTTPS queries
│   │   ├── zoneHealth.ts  # Zone health analysis
│   │   ├── subdomainEnum.ts # CT log subdomain enum
│   │   └── whoisLookup.ts # WHOIS queries
│   ├── middleware/
│   │   └── rateLimiter.ts # Rate limiting
│   └── utils/
│       └── domainValidator.ts # Input validation
├── public/
│   ├── index.html         # Landing page
│   ├── docs.html          # API documentation
│   ├── styles.css         # Styles
│   └── app.js             # Frontend JavaScript
├── dist/                  # Compiled JavaScript
├── package.json
└── tsconfig.json
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | Server port |
| `ALLOWED_ORIGINS` | * | CORS allowed origins (comma-separated) |
| `NODE_ENV` | development | Environment (production/development) |

## Deployment

### Vercel

```bash
npm i -g vercel
vercel
```

### Cloudflare Workers

The codebase can be adapted for Cloudflare Workers for edge deployment.

### Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
COPY public ./public
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

## API Integration Examples

### JavaScript/Node.js

```javascript
const response = await fetch('https://your-domain.com/api/v1/scan/example.com');
const data = await response.json();
console.log(data.health.grade); // 'A'
```

### Python

```python
import requests

response = requests.get('https://your-domain.com/api/v1/scan/example.com')
data = response.json()
print(data['health']['grade'])  # 'A'
```

## Future Enhancements

- [ ] Redis-backed rate limiting for distributed deployment
- [ ] Webhook notifications for DNS changes
- [ ] Historical DNS record tracking
- [ ] Bulk domain scanning
- [ ] Integration with ClouDNS API for zone management
- [ ] MX server connectivity testing
- [ ] SPF/DKIM/DMARC detailed validation

## License

MIT

## Author

Built by Brian Jarvis for Variety Base Solutions
