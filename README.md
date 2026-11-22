# Ruta Flash

Aplicación web progresiva (PWA) ligera para repartidores y gestión de entregas multiparada, diseñada con enfoque local (`localStorage`), mapas con **Leaflet / OpenStreetMap**, enlaces directos a **Google Maps**, **Waze** y **WhatsApp**, control de caja y combustible, comprobantes de entrega, y gestión segura de cuenta con **Firebase Authentication** y **Cloud Firestore**.

## Características principales

- **Gestión de rutas y paradas:** Crea pedidos, define prioridad (`Normal` / `Urgente`), hora límite, extrae datos rápidos desde texto pegado de WhatsApp y optimiza el orden de entregas.
- **GPS y mapas sin depender de APIs de mapas de pago:** Usa geolocalización del dispositivo y **Leaflet + OpenStreetMap**, además de accesos directos para navegar en Google Maps o Waze y chatear por WhatsApp.
- **Cuadre de caja y combustible:** Calcula distancia estimada (incluyendo retorno al punto base), consumo estimado de gasolina según vehículo/rendimiento/precio, efectivo en mano, montos digitales, montos a comercios y ganancia neta.
- **Comprobantes de entrega:** Permite adjuntar foto comprimida y nota al confirmar una entrega, con visor a pantalla completa.
- **Modo Día / Noche:** Cambio de tema claro y oscuro desde el encabezado.
- **Privacidad, cuenta segura y control de datos:**
  - Plan gratuito con límite de hasta **20 paradas pendientes** y aviso/anuncio discreto.
  - Plan **PRO ($3.75 / mes)** orientado a paradas ilimitadas, funciones sin conexión/rastreo y experiencia sin anuncios.
  - Autenticación con correo y contraseña mediante **Firebase Auth** (`Crear Cuenta`, `Iniciar / Recuperar` y `Cerrar sesión`).
  - Perfil ligero (`email`, `isPro`, `updatedAt`) guardado por `uid` en **Cloud Firestore** (`cuentas_ruta_flash/{userId}`), con reglas que impiden que el cliente modifique `isPro` a `true` directamente.
  - Opciones en **Ajustes** para **Borrar Datos Locales** del equipo y **Solicitar Eliminar Cuenta** vía correo a `joelvysalazar0406@gmail.com`.

## Estructura del proyecto

- `index.html`: Estructura de la interfaz (pestañas *Ruta*, *Nuevo*, *Mapa*, *Caja* y *Ajustes*), modales y configuración de servicios (`SUPPORT_EMAIL`, `FIREBASE_CONFIG`, `ADMOB_CONFIG`, `BILLING_CONFIG`).
- `app.js`: Lógica de estado local, cálculo de rutas/combustible/caja, integración con Leaflet/Nominatim, compresión de fotos, autenticación/sincronización con Firebase y acciones de privacidad/soporte.
- `styles.css`: Estilos responsivos y variables de tema claro/oscuro.
- `manifest.json`: Metadatos de PWA e íconos.
- `sw.js`: Service Worker para caché de recursos estáticos y teselas de mapa.

## Configuración de Firebase

1. Crea un proyecto en **Firebase Console** y registra la aplicación web.
2. Habilita **Authentication -> Correo electrónico/contraseña**.
3. Crea la base de datos **Cloud Firestore** y publica las reglas de seguridad de `cuentas_ruta_flash/{userId}` para que cada usuario lea/escriba solo su propio documento y no pueda modificar `isPro` directamente desde el cliente.
4. Verifica que `FIREBASE_CONFIG` en `index.html` contenga las credenciales de tu proyecto.

## Publicación web y empaquetado para Google Play

- **Web / PWA:** Puedes alojar los archivos en un hosting estático con HTTPS (por ejemplo, GitHub Pages o Netlify).
- **Google Play:** Para publicar en Google Play se requiere generar un **Android App Bundle (`.aab`)** firmado (por ejemplo, mediante un contenedor/TWA como PWABuilder o Bubblewrap), configurar los IDs de anuncios y suscripciones correspondientes, y completar la política de privacidad y declaración de seguridad de datos.

## Soporte y notas

- Correo de soporte y solicitudes de eliminación de cuenta: `joelvysalazar0406@gmail.com`.
- Los datos de pedidos, entregas y cuadre se almacenan localmente en el dispositivo (`ruta_flash_state_v3`); no se respaldan fotos ni rutas completas en Firestore.
- Reemplaza los valores marcador (`PEGAR_AQUI_...` y la URL pública de la política de privacidad) antes de distribuir en producción.
