/**
 * @fileoverview Nombres centralizados de colecciones de Firestore.
 * Usar siempre estas constantes en lugar de strings literales para evitar
 * errores tipográficos y facilitar refactorizaciones futuras.
 *
 * @module config/collections
 */

/** Colección de usuarios (perfiles y roles) */
export const COL_USERS = 'users';

/** Colección de noticias de la JAL */
export const COL_NOTICIAS = 'noticias';

/** Colección de eventos de la JAL */
export const COL_EVENTOS = 'eventos';

/** Colección de trámites / info carta inicial estudiantiles */
export const COL_ARCHIVOS = 'info_carta_inicial';

/** Colección privada con IDs y enlaces de cartas expedidas. Solo Edil. */
export const COL_DOCUMENTOS_CARTAS = 'info_carta_documentos';

/**
 * Roles del sistema.
 * Deben coincidir exactamente con el valor del campo `rol` en Firestore.
 */
export const ROLES = {
  /** Edil de la JAL — acceso total */
  EDIL:       'edil',
  /** Estudiante — gestiona su propio trámite */
  ESTUDIANTE: 'estudiante',
  /** Público general — solo lectura (sin sesión) */
  PUBLICO:    'publico',
};

/**
 * Estados posibles de un trámite estudiantil.
 */
export const ESTADOS_TRAMITE = {
  PENDIENTE: 'Pendiente',
  APROBADO:  'Aprobado',
  RECHAZADO: 'Rechazado',
  EXPEDIDA:  'Expedida',
};
