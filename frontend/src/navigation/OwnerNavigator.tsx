import { createNativeStackNavigator } from '@react-navigation/native-stack';

import AnalyticsScreen from '../screens/owner/AnalyticsScreen';
import BookingsScreen from '../screens/owner/BookingsScreen';
import ChatScreen from '../screens/owner/ChatScreen';
import DashboardScreen from '../screens/owner/DashboardScreen';
import DeliveryScreen from '../screens/owner/DeliveryScreen';
import FeedbackScreen from '../screens/owner/FeedbackScreen';
import InventoryScreen from '../screens/owner/InventoryScreen';
import NotificationsScreen from '../screens/owner/NotificationsScreen';
import OrdersScreen from '../screens/owner/OrdersScreen';
import ProductsScreen from '../screens/owner/ProductsScreen';
import ProfileScreen from '../screens/owner/ProfileScreen';
import ProjectsScreen from '../screens/owner/ProjectsScreen';
import ReportsScreen from '../screens/owner/ReportsScreen';
import RequestsScreen from '../screens/owner/RequestsScreen';

export type OwnerStackParamList = {
  Dashboard: undefined;
  Products: undefined;
  Inventory: undefined;
  Orders: undefined;
  Bookings: undefined;
  Delivery: undefined;
  Requests: undefined;
  Projects: undefined;
  Chat: undefined;
  Analytics: undefined;
  Reports: undefined;
  Notifications: undefined;
  Feedback: undefined;
  Profile: undefined;
};

const Stack = createNativeStackNavigator<OwnerStackParamList>();

/**
 * OWNER role — see FRONTEND_HANDOFF.md §6 for the full capability checklist this
 * mirrors. Note: OWNER has NO access at all to Installers (not even read) — that
 * screen intentionally does not appear here.
 */
export default function OwnerNavigator() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="Dashboard" component={DashboardScreen} />
      <Stack.Screen name="Products" component={ProductsScreen} />
      <Stack.Screen name="Inventory" component={InventoryScreen} />
      <Stack.Screen name="Orders" component={OrdersScreen} />
      <Stack.Screen name="Bookings" component={BookingsScreen} />
      <Stack.Screen name="Delivery" component={DeliveryScreen} />
      <Stack.Screen name="Requests" component={RequestsScreen} />
      <Stack.Screen name="Projects" component={ProjectsScreen} />
      <Stack.Screen name="Chat" component={ChatScreen} />
      <Stack.Screen name="Analytics" component={AnalyticsScreen} />
      <Stack.Screen name="Reports" component={ReportsScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
      <Stack.Screen name="Feedback" component={FeedbackScreen} />
      <Stack.Screen name="Profile" component={ProfileScreen} />
    </Stack.Navigator>
  );
}
