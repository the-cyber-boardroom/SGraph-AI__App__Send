---
layout: default
title: SGraph Send
---

<div class="hero">
  <h1>SGraph Send</h1>
  <p class="tagline">Zero-knowledge encrypted file sharing. Your files, encrypted in your browser, before they ever leave your device.</p>
  <a href="https://send.sgraph.ai" class="cta-button">Try SGraph Send</a>
</div>

<div class="key-messages">
  <div class="key-message">
    <h3>Encrypted in your browser</h3>
    <p>Your files are encrypted with AES-256-GCM using the Web Crypto API before they leave your device. The encryption key is generated locally and never sent to the server.</p>
  </div>
  <div class="key-message">
    <h3>We never have the key</h3>
    <p>The server stores only encrypted bytes. It has no way to read your files. Even a complete server breach cannot expose your data.</p>
  </div>
  <div class="key-message">
    <h3>Transparency, not trust</h3>
    <p>The transparency panel shows you exactly what the server captured and what it did not. No surprises. No hidden tracking. Verify it yourself.</p>
  </div>
</div>

---

## Latest updates

<ul class="post-list">
{% for post in site.posts limit:5 %}
  <li>
    <a class="post-link" href="{{ post.url | relative_url }}">{{ post.title }}</a>
    <span class="post-date">{{ post.date | date: "%d %B %Y" }}</span>
    {% if post.excerpt %}<p class="post-excerpt">{{ post.excerpt | strip_html | truncatewords: 30 }}</p>{% endif %}
  </li>
{% endfor %}
</ul>

[View all posts &rarr;]({{ '/blog/' | relative_url }})
