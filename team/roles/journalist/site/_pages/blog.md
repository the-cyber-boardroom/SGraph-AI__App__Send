---
layout: page
title: Blog
permalink: /blog/
---

All articles, daily updates, and project news from the SGraph Send team.

<ul class="post-list">
{% for post in site.posts %}
  <li>
    <a class="post-link" href="{{ post.url | relative_url }}">{{ post.title }}</a>
    <span class="post-date">{{ post.date | date: "%d %B %Y" }}</span>
    {% if post.excerpt %}<p class="post-excerpt">{{ post.excerpt | strip_html | truncatewords: 40 }}</p>{% endif %}
  </li>
{% endfor %}
</ul>
