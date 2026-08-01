import type { Request, Response } from 'express';

import { AppError } from '../../utils/AppError';
import { catchAsync } from '../../utils/catchAsync';
import { sendSuccess } from '../../utils/response';
import { CartService, cartService } from './cart.service';

export class CartController {
  constructor(private readonly cartService: CartService) {}

  private getCustomerId(req: Request): string {
    if (!req.user) {
      throw new AppError('Authentication required.', 401);
    }
    return req.user.id;
  }

  getCart = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const cart = await this.cartService.getCart(this.getCustomerId(req));
    sendSuccess(res, 200, 'Cart retrieved successfully.', { cart });
  });

  addItem = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const cart = await this.cartService.addItem(this.getCustomerId(req), req.body);
    sendSuccess(res, 201, 'Item added to cart successfully.', { cart });
  });

  updateItem = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const cart = await this.cartService.updateItemQuantity(
      this.getCustomerId(req),
      req.params.productId as string,
      req.body.quantity,
    );
    sendSuccess(res, 200, 'Cart item updated successfully.', { cart });
  });

  removeItem = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const cart = await this.cartService.removeItem(this.getCustomerId(req), req.params.productId as string);
    sendSuccess(res, 200, 'Item removed from cart successfully.', { cart });
  });

  clearCart = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const cart = await this.cartService.clearCart(this.getCustomerId(req));
    sendSuccess(res, 200, 'Cart cleared successfully.', { cart });
  });
}

export const cartController = new CartController(cartService);
