# Cerebrum

> OpenWolf's learning memory. Updated automatically as the AI learns from interactions.
> Do not edit manually unless correcting an error.
> Last updated: 2026-03-29

## User Preferences

<!-- How the user likes things done. Code style, tools, patterns, communication. -->

## Key Learnings

- **Project:** pully
- **Description:** Pully — video downloader
- **Page Content Flow:** When a webpage is "remembered" (contentType='page'), the page content (extracted via DOM from h1/h2/h3/p/li elements) must be: (1) captured in the Browser, (2) passed through the IPC handler to metadata.page, (3) included in the LLM request for summarization. For Gemini: page content forces fallback to text path (avoids YouTube video API). For other providers: page content is always included in the prompt.
- **YouTube Video Detection:** YouTube blocks yt-dlp aggressively (rate limiting, auth requirements). Solution: use JavaScript DOM extraction as primary method for YouTube (instant, 100% reliable), with yt-dlp as fallback for other sites. This is more reliable than trying to fix yt-dlp alone.

## Do-Not-Repeat

<!-- Mistakes made and corrected. Each entry prevents the same mistake recurring. -->
<!-- Format: [YYYY-MM-DD] Description of what went wrong and what to do instead. -->

## Decision Log

<!-- Significant technical decisions with rationale. Why X was chosen over Y. -->
