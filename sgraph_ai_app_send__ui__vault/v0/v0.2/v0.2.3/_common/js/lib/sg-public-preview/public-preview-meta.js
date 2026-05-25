/* =================================================================================
   SGraph Public Vault Previews — client-side Open Graph meta injection
   v0.1.0

   Injects og:* / twitter:* tags into document.head from a preview object. This
   serves JS-capable humans; non-JS crawlers (WhatsApp/LinkedIn) need the
   server-side OG route (Public_Preview__Service / Routes__Public_Preview).
   ================================================================================= */

const PublicPreviewMeta = {

    inject(preview, url) {
        if (!preview || !preview.title) return
        const image = (preview.thumbnail && preview.thumbnail.mode === 'inline') ? (preview.thumbnail.data || '') : ''
        const tags = {
            'og:title':            preview.title,
            'og:description':      preview.description || '',
            'og:type':             'website',
            'twitter:card':        'summary_large_image',
            'twitter:title':       preview.title,
            'twitter:description': preview.description || ''
        }
        if (url)   tags['og:url']     = url
        if (image) { tags['og:image'] = image; tags['twitter:image'] = image }

        for (const [key, content] of Object.entries(tags)) {
            const attr = key.startsWith('og:') ? 'property' : 'name'
            let el = document.head.querySelector(`meta[${attr}="${key}"]`)
            if (!el) { el = document.createElement('meta'); el.setAttribute(attr, key); document.head.appendChild(el) }
            el.setAttribute('content', content)
        }
        if (preview.title) document.title = preview.title
    }
}

if (typeof module !== 'undefined' && module.exports) module.exports = { PublicPreviewMeta }
