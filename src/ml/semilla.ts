/**
 * Corpus inicial del clasificador: descripciones típicas de extractos y registros en Colombia,
 * agrupadas por categoría. El clasificador arranca con esto y luego aprende de las correcciones
 * de cada usuario (`entrenarConUsuario`). Cada entrada es un par `[descripción, categoría]`.
 */
import type { IdCategoria } from '../lib/tipos'

export const SEMILLA: [string, IdCategoria][] = [
  // Comida y restaurantes
  ['Crepes & Waffles', 'comida'], ['Juan Valdez Cafe', 'comida'], ['Rappi restaurante', 'comida'], ['Frisby', 'comida'],
  ['El Corral hamburguesas', 'comida'], ['Domino s pizza', 'comida'], ['Kokoriko', 'comida'], ['Presto', 'comida'],
  ['Restaurante almuerzo ejecutivo', 'comida'], ['Panaderia', 'comida'], ['Cafeteria universidad', 'comida'],
  ['McDonalds', 'comida'], ['Starbucks', 'comida'], ['Sushi', 'comida'], ['Asadero pollo', 'comida'],
  ['Corrientazo', 'comida'], ['Didi food', 'comida'], ['iFood domicilio', 'comida'], ['Helados Popsy', 'comida'],
  ['Tostao cafe y pan', 'comida'], ['Pizzeria', 'comida'], ['Comidas rapidas', 'comida'], ['Bar cerveceria', 'comida'],
  // Mercado
  ['Almacenes Exito', 'mercado'], ['Tiendas D1', 'mercado'], ['Tiendas Ara', 'mercado'], ['Carulla', 'mercado'],
  ['Olimpica supermercado', 'mercado'], ['Jumbo Cencosud', 'mercado'], ['Makro', 'mercado'], ['PriceSmart', 'mercado'],
  ['Supermercado La 14', 'mercado'], ['Mercaderia tienda barrio', 'mercado'], ['Fruver', 'mercado'], ['Surtimax', 'mercado'],
  ['Colsubsidio supermercado', 'mercado'], ['Rappi mercado', 'mercado'], ['Justo y Bueno', 'mercado'], ['Isimo', 'mercado'],
  // Transporte
  ['Uber trip', 'transporte'], ['Didi rides', 'transporte'], ['Cabify', 'transporte'], ['Indriver', 'transporte'],
  ['MIO recarga', 'transporte'], ['Transmilenio recarga tullave', 'transporte'], ['Metro de Medellin civica', 'transporte'],
  ['Terpel gasolina', 'transporte'], ['Estacion de servicio Primax', 'transporte'], ['Texaco combustible', 'transporte'],
  ['Parqueadero', 'transporte'], ['Peaje', 'transporte'], ['Taxi', 'transporte'], ['Avianca', 'transporte'],
  ['Latam airlines', 'transporte'], ['Bus intermunicipal', 'transporte'], ['Lavado carro', 'transporte'], ['Soat', 'transporte'],
  // Entretenimiento
  ['Netflix', 'entretenimiento'], ['Spotify', 'entretenimiento'], ['Disney plus', 'entretenimiento'], ['HBO Max', 'entretenimiento'],
  ['Amazon prime video', 'entretenimiento'], ['Cine Colombia', 'entretenimiento'], ['Cinemark', 'entretenimiento'],
  ['Procinal', 'entretenimiento'], ['Steam games', 'entretenimiento'], ['PlayStation store', 'entretenimiento'],
  ['Youtube premium', 'entretenimiento'], ['Tuboleta concierto', 'entretenimiento'], ['Discoteca', 'entretenimiento'],
  ['Apple music', 'entretenimiento'], ['Crunchyroll', 'entretenimiento'], ['Bolera', 'entretenimiento'],
  // Servicios
  ['Claro hogar internet', 'servicios'], ['Movistar plan celular', 'servicios'], ['Tigo', 'servicios'], ['WOM recarga', 'servicios'],
  ['EPM energia', 'servicios'], ['Emcali acueducto', 'servicios'], ['Codensa Enel', 'servicios'], ['Vanti gas natural', 'servicios'],
  ['Gases de Occidente', 'servicios'], ['Acueducto', 'servicios'], ['Etb internet', 'servicios'], ['Celsia energia', 'servicios'],
  ['Cuota manejo tarjeta', 'servicios'], ['Comision bancaria', 'servicios'], ['4x1000 GMF', 'servicios'], ['Seguro vida', 'servicios'],
  ['Google storage', 'servicios'], ['iCloud almacenamiento', 'servicios'], ['Administracion conjunto', 'vivienda'],
  // Compras
  ['Falabella', 'compras'], ['Mercado libre', 'compras'], ['Amazon', 'compras'], ['Zara', 'compras'], ['Arturo Calle', 'compras'],
  ['Studio F', 'compras'], ['Koaj', 'compras'], ['Homecenter', 'compras'], ['Alkosto', 'compras'], ['Ktronix', 'compras'],
  ['Tienda de ropa', 'compras'], ['Adidas', 'compras'], ['Nike', 'compras'], ['Temu', 'compras'], ['Shein', 'compras'],
  ['Pepe Ganga', 'compras'], ['Miniso', 'compras'], ['Panamericana libreria', 'compras'], ['Flamingo', 'compras'],
  // Salud
  ['Drogueria', 'salud'], ['Farmatodo', 'salud'], ['Cruz Verde', 'salud'], ['La Rebaja drogueria', 'salud'], ['Locatel', 'salud'],
  ['EPS copago', 'salud'], ['Medicina prepagada', 'salud'], ['Odontologia', 'salud'], ['Laboratorio clinico', 'salud'],
  ['Gimnasio Bodytech', 'salud'], ['Smart Fit', 'salud'], ['Optica', 'salud'], ['Psicologo consulta', 'salud'],
  // Educación
  ['Matricula universidad', 'educacion'], ['Platzi', 'educacion'], ['Coursera', 'educacion'], ['Udemy', 'educacion'],
  ['Colegio pension', 'educacion'], ['Curso ingles', 'educacion'], ['Duolingo', 'educacion'], ['Libros', 'educacion'],
  ['ICETEX cuota', 'educacion'], ['Smart Language', 'educacion'],
  // Vivienda
  ['Arriendo apartamento', 'vivienda'], ['Canon arrendamiento', 'vivienda'], ['Inmobiliaria', 'vivienda'],
  ['Cuota credito hipotecario', 'vivienda'], ['Ferreteria', 'vivienda'], ['Muebles', 'vivienda'],
  // Transferencias
  ['Transferencia Nequi', 'transferencias'], ['Envio Daviplata', 'transferencias'], ['Transferencia a cuenta', 'transferencias'],
  ['Transf Bre-B', 'transferencias'], ['Retiro cajero', 'transferencias'], ['Retiro ATM', 'transferencias'],
  ['Pago tarjeta de credito', 'transferencias'], ['Abono tarjeta', 'transferencias'],
  // Ingresos
  ['Pago nomina', 'ingresos'], ['Abono nomina empresa', 'ingresos'], ['Salario', 'ingresos'], ['Honorarios', 'ingresos'],
  ['Transferencia recibida', 'ingresos'], ['Consignacion recibida', 'ingresos'], ['Intereses ahorro', 'ingresos'],
  ['Prima de servicios', 'ingresos'], ['Reembolso', 'ingresos'], ['Venta freelance', 'ingresos'], ['Abono de', 'ingresos'],
  // Otros
  ['Donacion', 'otros'], ['Regalo', 'otros'], ['Varios', 'otros'], ['Lavanderia', 'otros'], ['Peluqueria', 'otros'],
  ['Barberia', 'otros'], ['Veterinaria', 'otros'], ['Mascotas Puppis', 'otros'],
]
