# Topic: workos_authkit_nextjs

## Overview
Describes how the WorkOS authkit-nextjs callback route derives a baseURL from NEXT_PUBLIC_WORKOS_REDIRECT_URI to avoid Docker-internal host redirects on Railway.

## Key Concepts
- WorkOS authkit-nextjs handleAuth configuration
- Railway Docker HOSTNAME default
- NEXT_PUBLIC_WORKOS_REDIRECT_URI origin parsing
