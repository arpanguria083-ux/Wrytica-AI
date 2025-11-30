# 🏗️ Wrytica AI - Build Guide

Complete guide for building and deploying Wrytica AI on your local system.

## 📋 Prerequisites

- **Node.js 18+** - [Download here](https://nodejs.org/)
- **npm** (comes with Node.js)
- **Git** (optional, for version control)

## 🚀 Quick Build (Automated)

### Option 1: Using Batch Script (Windows)
```bash
# Double-click build.bat or run in Command Prompt:
build.bat
```

### Option 2: Using PowerShell Script (Windows)
```powershell
# Right-click build.ps1 → Run with PowerShell, or:
.\build.ps1
```

### Option 3: Using npm Scripts
```bash
# Install dependencies and build in one command:
npm run install:build

# Or step by step:
npm install
npm run build
```

## 🔧 Manual Build Steps

### 1. Install Dependencies
```bash
npm install
```

### 2. Build for Production
```bash
npm run build
```

### 3. Preview Build Locally
```bash
npm run preview
```

The preview server will start at `http://localhost:4173`

## 📦 Build Output

After building, you'll find the production-ready files in the `dist/` folder:

```
dist/
├── index.html          # Main HTML file
├── assets/            # Compiled JS, CSS, and images
│   ├── index-[hash].js
│   ├── index-[hash].css
│   └── banner.png
└── ...
```

## 🌐 Deployment Options

### Deploy to Vercel
```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel
```

### Deploy to Netlify
```bash
# Install Netlify CLI
npm install -g netlify-cli

# Deploy
netlify deploy --prod --dir=dist
```

### Deploy to GitHub Pages
1. Build the project: `npm run build`
2. Push the `dist` folder to `gh-pages` branch
3. Enable GitHub Pages in repository settings

### Deploy to Any Static Host
Simply upload the contents of the `dist/` folder to your hosting service:
- AWS S3 + CloudFront
- Google Cloud Storage
- Azure Static Web Apps
- Firebase Hosting
- Any web server (Apache, Nginx, etc.)

## 🛠️ Additional Build Commands

### Clean Build (Remove old build first)
```bash
npm run build:clean
```

### Build and Preview
```bash
npm run build:preview
```

### Development Mode (Hot Reload)
```bash
npm run dev
```

## 🔍 Troubleshooting

### Build Fails with "Out of Memory"
Increase Node.js memory limit:
```bash
set NODE_OPTIONS=--max-old-space-size=4096
npm run build
```

### Dependencies Installation Fails
Clear npm cache and retry:
```bash
npm cache clean --force
npm install
```

### Build is Slow
- Close unnecessary applications
- Use `npm run build` instead of `npm run dev`
- Consider upgrading your Node.js version

### Port Already in Use (Preview)
Change the preview port:
```bash
npm run preview -- --port 5000
```

## 📊 Build Performance

Typical build times:
- **First build**: 30-60 seconds (includes dependency installation)
- **Subsequent builds**: 10-20 seconds
- **Build size**: ~500KB (gzipped)

## 🔒 Security Notes

- ✅ No API keys are included in the build
- ✅ User API keys are stored in browser localStorage only
- ✅ No sensitive data is transmitted to external servers
- ✅ Safe to deploy publicly

## 📝 Build Configuration

Build settings are configured in `vite.config.ts`:
- Output directory: `dist/`
- Asset optimization: Enabled
- Code splitting: Automatic
- Minification: Enabled in production

## 🎯 Next Steps

After building:
1. Test the build locally with `npm run preview`
2. Verify all features work correctly
3. Deploy to your chosen hosting platform
4. Configure custom domain (optional)
5. Set up SSL certificate (recommended)

## 💡 Tips

- Always test the production build before deploying
- Use `npm run preview` to catch any build-specific issues
- Keep dependencies updated with `npm update`
- Monitor build size with `npm run build` output

## 🆘 Need Help?

- Check the [README.md](README.md) for general setup
- Review [package.json](package.json) for available scripts
- Open an issue on GitHub for build-related problems

---

**Happy Building! 🚀**
