import { createRouter, createWebHistory } from 'vue-router';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: () => import('../pages/HomePage.vue') },
    { path: '/shelf', name: 'shelf', component: () => import('../pages/ShelfPage.vue') },
    { path: '/archive', name: 'archive', component: () => import('../pages/ArchivePage.vue') },
    { path: '/read/:slug', name: 'read', component: () => import('../pages/ReadPage.vue') },
    { path: '/manage', name: 'manage', component: () => import('../pages/ManagePage.vue') },
    { path: '/stats', name: 'stats', component: () => import('../pages/StatsPage.vue') },
    { path: '/about', name: 'about', component: () => import('../pages/AboutPage.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  scrollBehavior: () => ({ top: 0 }),
});
