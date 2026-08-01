import { Router } from 'express';

import authRoutes from '../modules/auth/auth.routes';
import bookingRoutes from '../modules/booking/booking.routes';
import cartRoutes from '../modules/cart/cart.routes';
import categoryRoutes from '../modules/category/category.routes';
import installerRoutes from '../modules/installer/installer.routes';
import inventoryRoutes from '../modules/inventory/inventory.routes';
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

export default router;
