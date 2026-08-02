import { Router } from 'express';

import analyticsRoutes from '../modules/analytics/analytics.routes';
import arRoutes from '../modules/ar/ar.routes';
import authRoutes from '../modules/auth/auth.routes';
import bookingRoutes from '../modules/booking/booking.routes';
import cartRoutes from '../modules/cart/cart.routes';
import categoryRoutes from '../modules/category/category.routes';
import chatRoutes from '../modules/chat/chat.routes';
import deliveryRoutes from '../modules/delivery/delivery.routes';
import feedbackRoutes from '../modules/feedback/feedback.routes';
import installerRoutes from '../modules/installer/installer.routes';
import inventoryRoutes from '../modules/inventory/inventory.routes';
import notificationRoutes from '../modules/notifications/notification.routes';
import orderRoutes from '../modules/order/order.routes';
import paymentRoutes from '../modules/payment/payment.routes';
import productRoutes from '../modules/product/product.routes';
import projectRoutes from '../modules/project/project.routes';
import reportsRoutes from '../modules/reports/reports.routes';
import requestRoutes from '../modules/request/request.routes';
import usersRoutes from '../modules/users/users.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/users', usersRoutes);
router.use('/categories', categoryRoutes);
router.use('/products', productRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/cart', cartRoutes);
router.use('/orders', orderRoutes);
router.use('/payments', paymentRoutes);
router.use('/bookings', bookingRoutes);
router.use('/installers', installerRoutes);
router.use('/chat', chatRoutes);
router.use('/notifications', notificationRoutes);
router.use('/feedback', feedbackRoutes);
router.use('/projects', projectRoutes);
router.use('/requests', requestRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/reports', reportsRoutes);
router.use('/ar', arRoutes);
router.use('/delivery', deliveryRoutes);

export default router;
