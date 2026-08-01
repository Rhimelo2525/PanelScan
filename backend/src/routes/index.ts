import { Router } from 'express';

import authRoutes from '../modules/auth/auth.routes';
import bookingRoutes from '../modules/booking/booking.routes';
import cartRoutes from '../modules/cart/cart.routes';
import categoryRoutes from '../modules/category/category.routes';
import chatRoutes from '../modules/chat/chat.routes';
import feedbackRoutes from '../modules/feedback/feedback.routes';
import installerRoutes from '../modules/installer/installer.routes';
import inventoryRoutes from '../modules/inventory/inventory.routes';
import notificationRoutes from '../modules/notifications/notification.routes';
import orderRoutes from '../modules/order/order.routes';
import paymentRoutes from '../modules/payment/payment.routes';
import productRoutes from '../modules/product/product.routes';
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

export default router;
