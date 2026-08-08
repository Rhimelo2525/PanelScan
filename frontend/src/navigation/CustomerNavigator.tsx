import { createNativeStackNavigator } from '@react-navigation/native-stack';

import ARScreen from '../screens/customer/ARScreen';
import BookingsScreen from '../screens/customer/BookingsScreen';
import CartScreen from '../screens/customer/CartScreen';
import ChatScreen from '../screens/customer/ChatScreen';
import CheckoutScreen from '../screens/customer/CheckoutScreen';
import DeliveryScreen from '../screens/customer/DeliveryScreen';
import FeedbackScreen from '../screens/customer/FeedbackScreen';
import HomeScreen from '../screens/customer/HomeScreen';
import NotificationsScreen from '../screens/customer/NotificationsScreen';
import OrdersScreen from '../screens/customer/OrdersScreen';
import PaymentsScreen from '../screens/customer/PaymentsScreen';
import ProductDetailsScreen from '../screens/customer/ProductDetailsScreen';
import ProductsScreen from '../screens/customer/ProductsScreen';
import ProfileScreen from '../screens/customer/ProfileScreen';
import ProjectsScreen from '../screens/customer/ProjectsScreen';

export type CustomerStackParamList = {
  Home: undefined;
  Products: undefined;
  ProductDetails: undefined;
  Cart: undefined;
  Checkout: undefined;
  Orders: undefined;
  Payments: undefined;
  Bookings: undefined;
  AR: undefined;
  Chat: undefined;
  Notifications: undefined;
  Feedback: undefined;
  Projects: undefined;
  Delivery: undefined;
  Profile: undefined;
};

const Stack = createNativeStackNavigator<CustomerStackParamList>();

/** CUSTOMER role — see FRONTEND_HANDOFF.md §6 for the full capability checklist this mirrors. */
export default function CustomerNavigator() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="Home" component={HomeScreen} />
      <Stack.Screen name="Products" component={ProductsScreen} />
      <Stack.Screen name="ProductDetails" component={ProductDetailsScreen} />
      <Stack.Screen name="Cart" component={CartScreen} />
      <Stack.Screen name="Checkout" component={CheckoutScreen} />
      <Stack.Screen name="Orders" component={OrdersScreen} />
      <Stack.Screen name="Payments" component={PaymentsScreen} />
      <Stack.Screen name="Bookings" component={BookingsScreen} />
      <Stack.Screen name="AR" component={ARScreen} />
      <Stack.Screen name="Chat" component={ChatScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
      <Stack.Screen name="Feedback" component={FeedbackScreen} />
      <Stack.Screen name="Projects" component={ProjectsScreen} />
      <Stack.Screen name="Delivery" component={DeliveryScreen} />
      <Stack.Screen name="Profile" component={ProfileScreen} />
    </Stack.Navigator>
  );
}
