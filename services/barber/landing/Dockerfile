FROM nginx:1.27-alpine

# Identifies this build so index.html's asset references (?v=...) change
# whenever a new image is deployed, busting the 7-day immutable browser
# cache on widget.js/style.css. Passed via --build-arg from deploy.sh
# (git short SHA); "dev" is just a safe local-build fallback.
ARG BUILD_VERSION=dev

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY wait-for-backend.sh /usr/local/bin/wait-for-backend.sh
COPY index.html /usr/share/nginx/html/
COPY favicon.ico /usr/share/nginx/html/
COPY robots.txt /usr/share/nginx/html/
COPY sitemap.xml /usr/share/nginx/html/
COPY css/ /usr/share/nginx/html/css/
COPY js/ /usr/share/nginx/html/js/
COPY images/ /usr/share/nginx/html/images/

RUN sed -i "s/__BUILD_VERSION__/${BUILD_VERSION}/g" /usr/share/nginx/html/index.html
RUN chmod +x /usr/local/bin/wait-for-backend.sh

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1/ || exit 1

CMD ["/bin/sh", "-c", "/usr/local/bin/wait-for-backend.sh barber-backend 3001 30 && nginx -g 'daemon off;'"]
