# Ruta Flash

Aplicación web progresiva (PWA) ligera para repartidores y gestión de entregas multiparada, diseñada con enfoque local (`localStorage`)[span_9](start_span)[span_9](end_span), mapas con **Leaflet / OpenStreetMap**[span_10](start_span)[span_10](end_span), enlaces directos a **Google Maps**, **Waze** y **WhatsApp**[span_11](start_span)[span_11](end_span), control de caja y combustible[span_12](start_span)[span_12](end_span), comprobantes de entrega[span_13](start_span)[span_13](end_span), y gestión segura de cuenta con **Firebase Authentication** y **Cloud Firestore**[span_14](start_span)[span_14](end_span).

## Características principales

- **Gestión de rutas y paradas:** Crea pedidos, define prioridad (`Normal` / `Urgente`), hora límite, extrae datos rápidos desde texto pegado de WhatsApp y optimiza el orden de entregas[span_15](start_span)[span_15](end_span)[span_16](start_span)[span_16](end_span).
- **GPS y mapas sin depender de APIs de mapas de pago:** Usa geolocalización del dispositivo y **Leaflet + OpenStreetMap**, además de accesos directos para navegar en Google Maps o Waze y chatear por WhatsApp[span_17](start_span)[span_17](end_span)[span_18](start_span)[span_18](end_span).
- **Cuadre de caja y combustible:** Calcula distancia estimada (incluyendo retorno al punto base), consumo estimado de gasolina según vehículo/rendimiento/precio, efectivo en mano, montos digitales, montos a comercios y ganancia neta[span_19](start_span)[span_19](end_span)[span_20](start_span)[span_20](end_span).
- **Comprobantes de entrega:** Permite adjuntar foto comprimida y nota al confirmar una entrega, con visor a pantalla completa[span_21](start_span)[span_21](end_span)[span_22](start_span)[span_22](end_span).
- **Modo Día / Noche:** Cambio de tema claro y oscuro desde el encabezado[span_23](start_span)[span_23](end_span)[span_24](start_span)[span_24](end_span).
- **Privacidad, cuenta segura y control de datos:**
  - Plan gratuito con límite de hasta **20 paradas pendientes** y aviso/anuncio discreto[span_25](start_span)[span_25](end_span)[span_26](start_span)[span_26](end_span).
  - Plan **PRO ($3.75 / mes)** orientado a paradas ilimitadas, funciones sin conexión/rastreo y experiencia sin anuncios[span_27](start_span)[span_27](end_span)[span_28](start_span)[span_28](end_span).
  - Autenticación con correo y contraseña mediante **Firebase Auth** (`Crear Cuenta`, `Iniciar / Recuperar` y `Cerrar sesión`)[span_29](start_span)[span_29](end_span)[span_30](start_span)[span_30](end_span).
  - Perfil ligero (`email`, `isPro`, `updatedAt`) guardado por `uid` en **Cloud Firestore** (`cuentas_ruta_flash/{userId}`), con reglas que impiden que el cliente modifique `isPro` a `true` directamente[span_31](start_span)[span_31](end_span).
  - Opciones en **Ajustes** para **Borrar Datos Locales** del equipo y **Solicitar Eliminar Cuenta** vía correo a `joelvysalazar0406@gmail.com`[span_32](start_span)[span_32](end_span)[span_33](start_span)[span_33](end_span).

## Estructura del proyecto

- `index.html`: Estructura de la interfaz (pestañas *Ruta*, *Nuevo*, *Mapa*, *Caja* y *Ajustes*), modales y configuración de servicios (`SUPPORT_EMAIL`, `FIREBASE_CONFIG`, `ADMOB_CONFIG`, `BILLING_CONFIG`)[span_34](start_span)[span_34](end_span).
- `app.js`: Lógica de estado local, cálculo de rutas/combustible/caja, integración con Leaflet/Nominatim, compresión de fotos, autenticación/sincronización con Firebase y acciones de privacidad/soporte[span_35](start_span)[span_35](end_span).
- `styles.css`: Estilos responsivos y variables de tema claro/oscuro[span_36](start_span)[span_36](end_span).
- `manifest.json`: Metadatos de PWA e íconos[span_37](start_span)[span_37](end_span).
- `sw.js`: Service Worker para caché de recursos estáticos y teselas de mapa[span_38](start_span)[span_38](end_span).

## Configuración de Firebase

1. Crea un proyecto en **Firebase Console** y registra la aplicación web[span_39](start_span)[span_39](end_span).
2. Habilita **Authentication -> Correo electrónico/contraseña**[span_40](start_span)[span_40](end_span)[span_41](start_span)[span_41](end_span).
3. Crea la base de datos **Cloud Firestore** y publica las reglas de seguridad de `cuentas_ruta_flash/{userId}` para que cada usuario lea/escriba solo su propio documento y no pueda modificar `isPro` directamente desde el cliente[span_42](start_span)[span_42](end_span).
4. Verifica que `FIREBASE_CONFIG` en `index.html` contenga las credenciales de tu proyecto[span_43](start_span)[span_43](end_span).

## Publicación web y empaquetado para Google Play

- **Web / PWA:** Puedes alojar los archivos en un hosting estático con HTTPS (por ejemplo, GitHub Pages o Netlify)[span_44](start_span)[span_44](end_span).
- **Google Play:** Para publicar en Google Play se requiere generar un **Android App Bundle (`.aab`)** firmado (por ejemplo, mediante un contenedor/TWA como PWABuilder o Bubblewrap), configurar los IDs de anuncios y suscripciones correspondientes, y completar la política de privacidad y declaración de seguridad de datos[span_45](start_span)[span_45](end_span).

## Soporte y notas

- Correo de soporte y solicitudes de eliminación de cuenta: `joelvysalazar0406@gmail.com`[span_46](start_span)[span_46](end_span).
- Los datos de pedidos, entregas y cuadre se almacenan localmente en el dispositivo (`ruta_flash_state_v3`); no se respaldan fotos ni rutas completas en Firestore[span_47](start_span)[span_47](end_span).
- Reemplaza los valores marcador (`PEGAR_AQUI_...` y la URL pública de la política de privacidad) antes de distribuir en producción[span_48](start_span)[span_48](end_span).
