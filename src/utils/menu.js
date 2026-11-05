import { Map, Home, BarChart2, List, Users, Bell, Building2, Database, UsersRound, LandPlot } from 'lucide-react';
import ExhibidorIcon from '../components/ExhibidorIcon';

// Menú de escritorio: lo usan la barra lateral (components/Sidebar.jsx) y el menú flotante de las
// pantallas con mapa (components/MenuFlotante.jsx). La BottomNav (móvil) tiene su propia lista.
// Al agregar/cambiar una pantalla: App.jsx (ruta), esta lista y BottomNav.jsx.
export const MENU_ITEMS = [
  { path: '/', name: 'Mapa Principal', Icon: Map, roles: ['Super Admin', 'Admin Principal', 'Anciano', 'Ministerial', 'Publicador'] },
  { path: '/register', name: 'Registrar Casa', Icon: Home, roles: ['Super Admin', 'Admin Principal', 'Anciano', 'Ministerial', 'Publicador'] },
  { path: '/stats', name: 'Estadísticas', Icon: BarChart2, roles: ['Super Admin', 'Admin Principal', 'Anciano', 'Ministerial'] },
  { path: '/list', name: 'Lista de Casas', Icon: List, roles: ['Super Admin', 'Admin Principal', 'Anciano', 'Ministerial'] },
  { path: '/territorios', name: 'Territorios', Icon: LandPlot, roles: ['Super Admin', 'Admin Principal', 'Anciano', 'Ministerial'] },
  { path: '/exhibidores', name: 'Exhibidores', Icon: ExhibidorIcon, roles: ['Super Admin', 'Admin Principal', 'Anciano', 'Ministerial', 'Publicador'] },
  { path: '/users', name: 'Usuarios', Icon: Users, roles: ['Super Admin', 'Admin Principal'] },
  { path: '/grupos', name: 'Grupos', Icon: UsersRound, roles: ['Super Admin', 'Admin Principal', 'Anciano', 'Ministerial'] },
  { path: '/alerts', name: 'Alertas', Icon: Bell, roles: ['Super Admin', 'Admin Principal'] },
  { path: '/congregaciones', name: 'Congregaciones', Icon: Building2, roles: ['Super Admin'] },
  { path: '/backup', name: 'Backup', Icon: Database, roles: ['Super Admin'] },
];

export const menuDe = (rol) => MENU_ITEMS.filter(item => item.roles.includes(rol));

// Pantallas que usan el mapa 3D de fondo (un solo mapa para todas; ver context/MapaFondoContext.jsx)
export const RUTAS_MAPA = ['/', '/register', '/territorios', '/exhibidores'];
