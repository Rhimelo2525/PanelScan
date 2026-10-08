package com.example.panelscan.data.repository

import com.example.panelscan.data.local.InMemoryNotificationStore
import com.example.panelscan.data.local.NotificationDestination
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class NotificationRepositoryTest {
    @Test
    fun `unread state and destination survive repository recreation`() {
        val store = InMemoryNotificationStore()
        val first = NotificationRepository(store)
        first.openCustomer("maria@gmail.com")
        val order = first.publish("Order approved", "Order PS-123 was approved.", NotificationDestination.ORDER, "order-123", 100L)!!
        val project = first.publish("Project saved", "A wall project was saved.", NotificationDestination.PROJECT, "project-1", 200L)!!
        assertEquals(2, first.unreadCount)
        first.markRead(order.id)

        val reopened = NotificationRepository(store)
        reopened.openCustomer("maria@gmail.com")
        assertEquals(1, reopened.unreadCount)
        assertEquals(NotificationDestination.PROJECT, reopened.notifications.value.first().destination)
        assertEquals("project-1", project.referenceId)
        assertTrue(reopened.notifications.value.first { it.id == order.id }.read)
        reopened.markAllRead()
        assertEquals(0, reopened.unreadCount)

        reopened.openCustomer("other@gmail.com")
        assertTrue(reopened.notifications.value.isEmpty())
        reopened.openCustomer(null)
        assertNull(reopened.publish("Fake", "No customer", NotificationDestination.NONE))
        assertFalse(store.load("maria@gmail.com").isEmpty())
    }
}
