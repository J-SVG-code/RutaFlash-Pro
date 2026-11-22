# ⚡ Ruta Flash v2.0 - PWA Delivery con Modo Offline PRO

## Novedades en esta versión (v2.0)
- **Modo Sin Conexión exclusivo del Plan PRO ($3.75/mes):**
  - **Rastreo GPS en vivo sin internet:** Muestra en tiempo real cuántos kilómetros/metros y minutos faltan para la siguiente parada y el total faltante hasta el punto de retorno.
  - **Botón `📥 Guardar Ruta Offline`:** Pre-descarga los mosaicos del mapa alrededor de tus paradas antes de salir para ver el mapa aunque te quedes sin datos.
  - **Control de acceso Offline:** En el Plan Gratis requiere conexión para operar la ruta; al activar PRO se desbloquea el uso continuo sin internet.

## Cómo subirla a Google Play (Costo $0 de servidor)
1. Sube esta carpeta a **Netlify** o **GitHub Pages** para obtener tu URL `https://...`.
2. Entra a **PWABuilder.com**, pega tu enlace HTTPS y genera el paquete Android (`.aab`) + `assetlinks.json`.
3. Coloca `assetlinks.json` dentro de `.well-known/assetlinks.json` en tu repositorio y vuelve a desplegar.
4. Sube el `.aab` a **Google Play Console** y crea la suscripción mensual de **$3.75 USD**.
