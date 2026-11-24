-- Datos iniciales opcionales: comercios aliados y promociones de ejemplo (ficticios).
insert into public.aliados (id, nombre, nit, categoria, ciudad, logo) values
  ('al-cafe', 'Café Origen del Valle', '901456789-1', 'comida', 'Cali', '☕'),
  ('al-fogata', 'La Fogata Caleña', '900321654-7', 'comida', 'Cali', '🔥'),
  ('al-mercado', 'Mercado Fresco Express', '901112233-4', 'mercado', 'Cali', '🥬'),
  ('al-libros', 'Librería Páginas Vivas', '900998877-2', 'educacion', 'Cali', '📚')
on conflict (id) do nothing;

insert into public.promociones (id, aliado_id, titulo, descripcion, beneficio, monto_minimo, desde, hasta, reglas) values
  ('pr-fogata', 'al-fogata', '15 % en tu próximo almuerzo',
   'Registra en FinTrack la factura de tu consumo en La Fogata Caleña y recibe un bono para tu próxima visita.',
   'Bono del 15 % en tu próximo consumo', 30000, current_date, current_date + 40,
   '["Factura electrónica o tiquete POS.", "Consumo mínimo de $30.000.", "Una participación por usuario.", "La factura debe ser de la vigencia de la promoción."]'),
  ('pr-cafe', 'al-cafe', 'Café gratis por tu racha',
   'Sube la factura de cualquier compra en Café Origen del Valle y llévate un café filtrado gratis.',
   'Un café filtrado gratis', 8000, current_date, current_date + 40,
   '["Compra mínima de $8.000.", "Válido en todas las sedes de Cali.", "Una participación por usuario."]')
on conflict (id) do nothing;
