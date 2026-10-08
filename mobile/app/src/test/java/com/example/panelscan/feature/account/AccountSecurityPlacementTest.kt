package com.example.panelscan.feature.account

import java.io.File
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AccountSecurityPlacementTest {

    @Test
    fun `change password is only exposed through customer profile account security`() {
        val sourceRoot = listOf(
            File("src/main/java/com/example/panelscan/feature/account"),
            File("app/src/main/java/com/example/panelscan/feature/account")
        ).first { it.isDirectory }
        val accountSource = File(sourceRoot, "AccountScreen.kt").readText()
        val profileSource = File(sourceRoot, "CustomerProfileScreen.kt").readText()

        assertFalse(accountSource.contains("title = \"Change Password\""))
        assertTrue(profileSource.contains("text = \"Account Security\""))
        assertTrue(profileSource.contains("showChangePasswordDialog = true"))
        assertTrue(profileSource.contains("ChangePasswordDialog("))
    }
}
