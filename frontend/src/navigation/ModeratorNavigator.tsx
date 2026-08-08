import { createNativeStackNavigator } from '@react-navigation/native-stack';

import AnalyticsScreen from '../screens/moderator/AnalyticsScreen';
import BookingsScreen from '../screens/moderator/BookingsScreen';
import ChatScreen from '../screens/moderator/ChatScreen';
import DashboardScreen from '../screens/moderator/DashboardScreen';
import DeliveryScreen from '../screens/moderator/DeliveryScreen';
import InstallersScreen from '../screens/moderator/InstallersScreen';
import InventoryScreen from '../screens/moderator/InventoryScreen';
import NotificationsScreen from '../screens/moderator/NotificationsScreen';
import OrdersScreen from '../screens/moderator/OrdersScreen';
import ProductsScreen from '../screens/moderator/ProductsScreen';
import ProjectsScreen from '../screens/moderator/ProjectsScreen';
import ReportsScreen from '../screens/moderator/ReportsScreen';
import RequestsScreen from '../screens/moderator/RequestsScreen';

export type ModeratorStackParamList = {
  Dashboard: undefined;
  Products: undefined;
  Orders: undefined;
  Inventory: undefined;
  Bookings: undefined;
  Installers: undefined;
  Requests: undefined;
  Projects: undefined;
  Delivery: undefined;
  Chat: undefined;
  Notifications: undefined;
  Analytics: undefined;
  Reports: undefined;
};

const Stack = createNativeStackNavigator<ModeratorStackParamList>();

/** MODERATOR role — see FRONTEND_HANDOFF.md §6 for the full capability checklist this mirrors. */
export default function ModeratorNavigator() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="Dashboard" component={DashboardScreen} />
      <Stack.Screen name="Products" component={ProductsScreen} />
      <Stack.Screen name="Orders" component={OrdersScreen} />
      <Stack.Screen name="Inventory" component={InventoryScreen} />
      <Stack.Screen name="Bookings" component={BookingsScreen} />
      <Stack.Screen name="Installers" component={InstallersScreen} />
      <Stack.Screen name="Requests" component={RequestsScreen} />
      <Stack.Screen name="Projects" component={ProjectsScreen} />
      <Stack.Screen name="Delivery" component={DeliveryScreen} />
      <Stack.Screen name="Chat" component={ChatScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
      <Stack.Screen name="Analytics" component={AnalyticsScreen} />
      <Stack.Screen name="Reports" component={ReportsScreen} />
    </Stack.Navigator>
  );
}
