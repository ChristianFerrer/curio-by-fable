// api/_lib/seed-data.js — Datos de ejemplo hardcodeados
// Se usan como fallback cuando el schema curio no existe en Supabase
'use strict';

const { v4: uuidv4 } = require('uuid');

// IDs fijos para consistencia
const IDS = {
  bloques:    'a1000001-0000-0000-0000-000000000001',
  torre:      'a1000002-0000-0000-0000-000000000002',
  puzzle:     'a1000003-0000-0000-0000-000000000003',
  cocinita:   'a1000004-0000-0000-0000-000000000004',
  animales:   'a1000005-0000-0000-0000-000000000005',
  memoria:    'a1000006-0000-0000-0000-000000000006',
  balancin:   'a1000007-0000-0000-0000-000000000007',
  domino:     'a1000008-0000-0000-0000-000000000008',
  abaco:      'a1000009-0000-0000-0000-000000000009',
  tren:       'a1000010-0000-0000-0000-000000000010',
  montessori: 'a1000011-0000-0000-0000-000000000011',
  casita:     'a1000012-0000-0000-0000-000000000012',
};

const CATEGORIES = [
  { id: 'c1000001-0000-0000-0000-000000000001', name: 'Juguetes Educativos',   slug: 'juguetes-educativos',   description: 'Juguetes que estimulan el aprendizaje', icon: '🧩', sort_order: 1 },
  { id: 'c1000002-0000-0000-0000-000000000002', name: 'Juegos de Mesa',        slug: 'juegos-de-mesa',        description: 'Diversión familiar en torno a la mesa', icon: '🎲', sort_order: 2 },
  { id: 'c1000003-0000-0000-0000-000000000003', name: 'Decoración Habitación', slug: 'decoracion-habitacion', description: 'Decora el espacio de tus hijos con madera', icon: '🏡', sort_order: 3 },
  { id: 'c1000004-0000-0000-0000-000000000004', name: 'Mobiliario Montessori', slug: 'mobiliario-montessori', description: 'Muebles para el método Montessori', icon: '🪑', sort_order: 4 },
  { id: 'c1000005-0000-0000-0000-000000000005', name: 'Puzzles',               slug: 'puzzles',               description: 'Puzzles de madera para todas las edades', icon: '🧸', sort_order: 5 },
  { id: 'c1000006-0000-0000-0000-000000000006', name: 'Construcción',          slug: 'construccion',          description: 'Bloques y construcciones de madera', icon: '🏗️', sort_order: 6 },
  { id: 'c1000007-0000-0000-0000-000000000007', name: 'Exterior',              slug: 'exterior',              description: 'Juguetes para disfrutar al aire libre', icon: '🌳', sort_order: 7 },
];

const PRODUCTS = [
  {
    id: IDS.bloques, name: 'Bloques de construcción natural 100 piezas', slug: 'bloques-construccion-natural-100',
    description: 'Set de 100 bloques de madera maciza natural sin pintar con múltiples formas geométricas.',
    long_description: 'Set de 100 bloques de madera maciza de haya natural sin pintar. Incluye cubos, cilindros, arcos, triángulos y rectángulos en distintos tamaños. Estimulan la creatividad, el pensamiento espacial y el juego libre.',
    price: 39.95, compare_price: 49.95, category: 'construccion', age_min: 3, age_max: 10, stock: 45,
    images: ['https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80','https://images.unsplash.com/photo-1566576912321-d58ddd7a6088?w=800&q=80'],
    featured: true, active: true, material: 'Madera de haya FSC', dimensions: 'Caja 35 × 25 × 10 cm', weight_grams: 1200,
    created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z',
  },
  {
    id: IDS.torre, name: 'Torre de encaje Montessori arcoíris', slug: 'torre-encaje-montessori-arcoiris',
    description: 'Torre de anillas de colores en madera. Ideal para el desarrollo motor fino y aprendizaje de colores.',
    long_description: 'Torre de anillas de colores vibrantes en madera de tilo. Con 10 anillas en degradado de colores del arcoíris, estimula el desarrollo motor fino y el reconocimiento de colores.',
    price: 24.95, compare_price: null, category: 'mobiliario_montessori', age_min: 1, age_max: 4, stock: 30,
    images: ['https://images.unsplash.com/photo-1587654780291-39c9404d746b?w=800&q=80'],
    featured: true, active: true, material: 'Madera de tilo + tintes acuosos', dimensions: 'Altura 28 cm, base 12 × 12 cm', weight_grams: 450,
    created_at: '2024-01-02T00:00:00Z', updated_at: '2024-01-02T00:00:00Z',
  },
  {
    id: IDS.puzzle, name: 'Puzzle del mundo en madera', slug: 'puzzle-mundo-madera',
    description: 'Puzzle mapa del mundo con 50 piezas. Cada continente es una pieza grande, ideal para aprender geografía.',
    long_description: 'Puzzle educativo del mapa del mundo fabricado en madera de abedul. 50 piezas de distintos tamaños que representan continentes, océanos y países principales.',
    price: 32.95, compare_price: null, category: 'puzzles', age_min: 4, age_max: 10, stock: 25,
    images: ['https://images.unsplash.com/photo-1606092195730-5d7b9af1efc5?w=800&q=80'],
    featured: true, active: true, material: 'Madera de abedul FSC', dimensions: '60 × 40 cm (montado)', weight_grams: 680,
    created_at: '2024-01-03T00:00:00Z', updated_at: '2024-01-03T00:00:00Z',
  },
  {
    id: IDS.cocinita, name: 'Cocinita de madera Montessori', slug: 'cocinita-madera-montessori',
    description: 'Cocinita de juego en madera natural con accesorios. Estimula el juego simbólico y la creatividad.',
    long_description: 'Cocinita de juego fabricada en madera de pino macizo. Incluye fogones, horno, fregadero y estantes. Medida perfecta para niños de 2 a 6 años.',
    price: 129.95, compare_price: 159.95, category: 'mobiliario_montessori', age_min: 2, age_max: 6, stock: 12,
    images: ['https://images.unsplash.com/photo-1615461066841-6116e61058f4?w=800&q=80'],
    featured: true, active: true, material: 'Pino macizo + MDF', dimensions: '90 × 30 × 85 cm', weight_grams: 8500,
    created_at: '2024-01-04T00:00:00Z', updated_at: '2024-01-04T00:00:00Z',
  },
  {
    id: IDS.animales, name: 'Set de animales del bosque en madera', slug: 'set-animales-bosque-madera',
    description: '12 figuras de animales del bosque talladas en madera de haya. Pintadas con tintes naturales.',
    long_description: 'Set de 12 figuras de animales del bosque europeo: oso, lobo, zorro, ciervo, conejo, erizo, búho y más. Talladas a mano en madera de haya y pintadas con tintes al agua.',
    price: 28.95, compare_price: null, category: 'juguetes_educativos', age_min: 2, age_max: 8, stock: 40,
    images: ['https://images.unsplash.com/photo-1584464491033-06628f3a6b7b?w=800&q=80'],
    featured: false, active: true, material: 'Madera de haya + tintes al agua', dimensions: 'Caja 20 × 15 × 8 cm', weight_grams: 320,
    created_at: '2024-01-05T00:00:00Z', updated_at: '2024-01-05T00:00:00Z',
  },
  {
    id: IDS.memoria, name: 'Juego de memoria animales', slug: 'juego-memoria-animales',
    description: '32 pares de cartas de madera con ilustraciones de animales. Juego de memoria clásico para toda la familia.',
    long_description: '32 pares de cartas de madera (64 piezas) con ilustraciones de 32 animales diferentes. Desarrolla la memoria, concentración y vocabulario.',
    price: 19.95, compare_price: 24.95, category: 'juegos_mesa', age_min: 3, age_max: 99, stock: 55,
    images: ['https://images.unsplash.com/photo-1611996575749-79a3a250f948?w=800&q=80'],
    featured: false, active: true, material: 'Madera de abedul', dimensions: 'Caja 22 × 16 × 4 cm', weight_grams: 280,
    created_at: '2024-01-06T00:00:00Z', updated_at: '2024-01-06T00:00:00Z',
  },
  {
    id: IDS.balancin, name: 'Balancín de madera para bebé', slug: 'balancin-madera-bebe',
    description: 'Balancín en forma de caballo de madera maciza. Diseño seguro y resistente para los más pequeños.',
    long_description: 'Balancín en forma de caballo fabricado en madera de pino macizo lijada y barnizada. Con asideros ergonómicos y sistema antivuelco.',
    price: 89.95, compare_price: null, category: 'exterior', age_min: 1, age_max: 4, stock: 8,
    images: ['https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?w=800&q=80'],
    featured: true, active: true, material: 'Pino macizo barnizado', dimensions: '70 × 35 × 55 cm', weight_grams: 5200,
    created_at: '2024-01-07T00:00:00Z', updated_at: '2024-01-07T00:00:00Z',
  },
  {
    id: IDS.domino, name: 'Dominó de frutas en madera', slug: 'domino-frutas-madera',
    description: '28 fichas de dominó con ilustraciones de frutas coloridas. Versión infantil del dominó clásico.',
    long_description: '28 fichas de dominó en madera de haya con ilustraciones de frutas a todo color. En lugar de puntos, cada ficha muestra frutas para una versión más divertida y educativa.',
    price: 16.95, compare_price: null, category: 'juegos_mesa', age_min: 3, age_max: 8, stock: 35,
    images: ['https://images.unsplash.com/photo-1596495578065-6e0763fa1178?w=800&q=80'],
    featured: false, active: true, material: 'Madera de haya + tintas al agua', dimensions: 'Caja 18 × 10 × 4 cm', weight_grams: 190,
    created_at: '2024-01-08T00:00:00Z', updated_at: '2024-01-08T00:00:00Z',
  },
  {
    id: IDS.abaco, name: 'Ábaco educativo de colores', slug: 'abaco-educativo-colores',
    description: 'Ábaco de 10 filas y 10 cuentas de madera en 5 colores. Perfecto para aprender a contar y sumar.',
    long_description: 'Ábaco de madera con 10 filas de 10 cuentas en 5 colores alternos. Marco en madera de haya y cuentas en madera de tilo pintadas con tintes al agua.',
    price: 22.95, compare_price: 27.95, category: 'juguetes_educativos', age_min: 3, age_max: 7, stock: 28,
    images: ['https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?w=800&q=80'],
    featured: false, active: true, material: 'Madera de haya y tilo', dimensions: '30 × 24 × 5 cm', weight_grams: 520,
    created_at: '2024-01-09T00:00:00Z', updated_at: '2024-01-09T00:00:00Z',
  },
  {
    id: IDS.tren, name: 'Tren de madera con vías 45 piezas', slug: 'tren-madera-vias-45-piezas',
    description: 'Set de tren de madera con locomotora, 3 vagones y 45 piezas de vías. Compatible con otros sets de madera.',
    long_description: 'Set completo de tren de madera con locomotora magnética, 3 vagones con carga y 45 piezas de vías rectas y curvas. Fabricado en madera de haya maciza.',
    price: 54.95, compare_price: 69.95, category: 'construccion', age_min: 2, age_max: 7, stock: 18,
    images: ['https://images.unsplash.com/photo-1545558014-8692077e9b5c?w=800&q=80'],
    featured: true, active: true, material: 'Madera de haya FSC', dimensions: 'Caja 40 × 30 × 12 cm', weight_grams: 1800,
    created_at: '2024-01-10T00:00:00Z', updated_at: '2024-01-10T00:00:00Z',
  },
  {
    id: IDS.montessori, name: 'Set Montessori letras y números', slug: 'montessori-letras-numeros',
    description: 'Set de 36 letras y 10 números en madera. Letras mayúsculas y minúsculas en relieve para aprender el abecedario.',
    long_description: 'Set completo de letras y números en madera de abedul con relieve táctil. Incluye 26 letras mayúsculas, 26 minúsculas y 10 números (0-9).',
    price: 34.95, compare_price: null, category: 'juguetes_educativos', age_min: 3, age_max: 7, stock: 22,
    images: ['https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=800&q=80'],
    featured: false, active: true, material: 'Madera de abedul', dimensions: 'Caja 28 × 20 × 6 cm', weight_grams: 380,
    created_at: '2024-01-11T00:00:00Z', updated_at: '2024-01-11T00:00:00Z',
  },
  {
    id: IDS.casita, name: 'Casita de muñecas en madera natural', slug: 'casita-munecas-madera-natural',
    description: 'Casita de muñecas de 3 plantas en madera natural. Sin pintar para decorar a gusto.',
    long_description: 'Casita de muñecas de 3 plantas y 6 habitaciones en madera de pino macizo sin pintar. Lista para decorar y personalizar. Incluye muebles básicos en madera.',
    price: 149.95, compare_price: 189.95, category: 'juguetes_educativos', age_min: 3, age_max: 10, stock: 6,
    images: ['https://images.unsplash.com/photo-1606041011872-596597976b25?w=800&q=80'],
    featured: true, active: true, material: 'Pino macizo', dimensions: '60 × 30 × 75 cm', weight_grams: 6800,
    created_at: '2024-01-12T00:00:00Z', updated_at: '2024-01-12T00:00:00Z',
  },
];

module.exports = { CATEGORIES, PRODUCTS };
