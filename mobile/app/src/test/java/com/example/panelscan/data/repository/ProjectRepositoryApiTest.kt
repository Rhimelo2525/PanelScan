package com.example.panelscan.data.repository

import com.example.panelscan.core.model.Estimation
import com.example.panelscan.core.model.MeasurementResult
import com.example.panelscan.core.model.PVCPanel
import com.example.panelscan.core.model.SavedProject
import com.example.panelscan.core.model.SurfaceType
import com.example.panelscan.core.network.ApiClient
import com.example.panelscan.core.session.CustomerUser
import com.example.panelscan.core.session.SessionManager
import com.example.panelscan.data.local.ProjectDao
import com.example.panelscan.data.local.ProjectEntity
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.runBlocking
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Protocol
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody
import okio.Buffer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** ProjectRepository: device projects saved to the account through a fake /api/projects. */
class ProjectRepositoryApiTest {

    private class FakeProjectDao : ProjectDao {
        val rows = MutableStateFlow<List<ProjectEntity>>(emptyList())
        override fun getAllProjects(): Flow<List<ProjectEntity>> = rows.map { list -> list.sortedByDescending { it.createdAt } }
        override suspend fun getProjectById(id: String): ProjectEntity? = rows.value.firstOrNull { it.id == id }
        override suspend fun insertProject(project: ProjectEntity) = rows.update { list -> list.filter { it.id != project.id } + project }
        override suspend fun deleteProject(project: ProjectEntity) = rows.update { list -> list.filter { it.id != project.id } }
    }

    private val panel = PVCPanel(
        id = "p1", name = "Oak Wall Panel", category = "Wall", widthMeters = 0.6, heightMeters = 2.4,
        textureResource = "wood_oak", pricePerUnit = 1850.0, sku = "OAK-60"
    )
    private val calls = mutableListOf<String>()
    private val dao = FakeProjectDao()
    private var signedIn = true

    private fun project(id: String = "app-1", createdAt: Long = 1_000L) = SavedProject(
        id = id,
        name = "Wall · 3.20 × 2.60 m",
        measurement = MeasurementResult(3.2, 2.6, 8.32, SurfaceType.WALL),
        selectedPanel = panel,
        estimation = Estimation(surfaceArea = 8.32, panelArea = 1.44, baseQuantity = 6, wastePercent = 10, finalQuantity = 7, estimatedCost = 12950.0),
        createdAt = createdAt
    )

    private fun remoteProject(externalId: String) =
        """{"id":"r-$externalId","name":"Ceiling · 4.00 × 3.00 m","source":"MOBILE_AR_3D","externalProjectId":"$externalId","status":"PENDING",
           "arMetadata":{"surfaceType":"CEILING","widthMeters":4.0,"heightMeters":3.0,"areaSquareMeters":12.0,"panelId":"p1","panelName":"Oak Wall Panel",
                         "baseQuantity":9,"wastePercent":10,"finalQuantity":10,"estimatedCost":18500.0,"savedAt":500},
           "createdAt":"2026-10-08T02:00:00.000Z"}"""

    private fun repository(respond: (method: String, path: String, body: String) -> String): ProjectRepository {
        val backend = Interceptor { chain ->
            val request = chain.request()
            val path = request.url.encodedPath.removePrefix("/api") + (request.url.encodedQuery?.let { "?$it" } ?: "")
            val body = request.body?.let { Buffer().also(it::writeTo).readUtf8() }.orEmpty()
            calls += "${request.method} $path $body".trim()
            val data = respond(request.method, path, body)
            val status = if (data.startsWith("!")) 400 else 200
            val json = if (status == 400) """{"success":false,"message":"${data.drop(1)}"}""" else """{"success":true,"message":"ok","data":$data}"""
            Response.Builder().request(request).protocol(Protocol.HTTP_1_1).code(status).message("")
                .body(json.toResponseBody("application/json".toMediaType())).build()
        }
        val session = SessionManager().apply {
            saveTokens("access", "refresh")
            setCustomerSession(CustomerUser(id = "me", firstName = "Juan", lastName = "Dela Cruz", email = "juan@gmail.com"))
        }
        val api = ApiClient("https://backend.test/api/", session, OkHttpClient.Builder().addInterceptor(backend).build())
        return ProjectRepository(dao, MutableStateFlow(listOf(panel)), api) { signedIn }
    }

    private val savedResponse = """{"project":{"id":"r-app-1","name":"x","externalProjectId":"app-1","createdAt":"2026-10-08T02:00:00.000Z"}}"""

    @Test
    fun `saving while signed in keeps it on the device and saves it to the account with its estimate`() = runBlocking {
        val repo = repository { _, _, _ -> savedResponse }

        assertNull(repo.saveProject(project()))

        assertEquals(listOf("app-1"), dao.rows.value.map { it.id })
        val sent = calls.single()
        assertTrue(sent.startsWith("POST /projects/mobile "))
        assertTrue(sent.contains("\"externalProjectId\":\"app-1\""))
        assertTrue(sent.contains("\"name\":\"Wall · 3.20 × 2.60 m\""))
        assertTrue(sent.contains("\"budget\":12950.0"))
        assertTrue(sent.contains("\"surfaceType\":\"WALL\""))
        assertTrue(sent.contains("\"widthMeters\":3.2"))
        assertTrue(sent.contains("\"panelName\":\"Oak Wall Panel\""))
        assertTrue(sent.contains("\"panelSku\":\"OAK-60\""))
        assertTrue(sent.contains("\"finalQuantity\":7"))
    }

    @Test
    fun `saving while signed out stays on the device only`() = runBlocking {
        signedIn = false
        val repo = repository { _, _, _ -> savedResponse }

        assertNull(repo.saveProject(project()))

        assertTrue(calls.isEmpty())
        assertEquals(1, dao.rows.value.size)
    }

    @Test
    fun `signing in brings the account's projects here and sends this device's projects up`() = runBlocking {
        signedIn = false
        val repo = repository { method, _, _ ->
            if (method == "GET") """{"projects":[${remoteProject("other-device")}],"pagination":{"totalPages":1}}""" else savedResponse
        }
        repo.saveProject(project("app-1"))
        signedIn = true

        assertNull(repo.onSignedIn())

        assertEquals("GET /projects?source=MOBILE_AR_3D&limit=100", calls.first())
        assertTrue(calls[1].startsWith("POST /projects/mobile ") && calls[1].contains("\"externalProjectId\":\"app-1\""))
        assertEquals(2, calls.size)

        val restored = repo.getProjectById("other-device")!!
        assertEquals(SurfaceType.CEILING, restored.measurement.surfaceType)
        assertEquals(12.0, restored.measurement.areaSquareMeters, 0.001)
        assertEquals("Oak Wall Panel", restored.selectedPanel.name)
        assertEquals(10, restored.estimation.finalQuantity)
        assertEquals(500L, restored.createdAt)

        // Signing out removes the account's projects from the device.
        repo.onSignedOut()
        assertTrue(dao.rows.value.isEmpty())
    }

    @Test
    fun `a project never uploaded stays on the device after signing out`() = runBlocking {
        val repo = repository { method, _, _ -> if (method == "GET") """{"projects":[]}""" else "!Server unavailable." }

        repo.onSignedIn()
        assertEquals("Server unavailable.", repo.saveProject(project("offline")))

        repo.onSignedOut()

        assertEquals(listOf("offline"), dao.rows.value.map { it.id })
    }

    @Test
    fun `deleting removes it from the account too, unless the team is already on it`() = runBlocking {
        var refuse = false
        val repo = repository { method, _, _ ->
            when {
                method == "GET" -> """{"projects":[${remoteProject("app-1")},${remoteProject("app-2")}]}"""
                refuse -> "!This project is already being handled by the PanelScan team and can no longer be deleted."
                else -> "null"
            }
        }
        repo.onSignedIn()
        val first = repo.getProjectById("app-1")!!
        val second = repo.getProjectById("app-2")!!

        assertNull(repo.deleteProject(first))
        assertEquals("DELETE /projects/mobile/app-1", calls.last())
        assertEquals(listOf("app-2"), dao.allIds())

        refuse = true
        assertEquals(
            "This project is already being handled by the PanelScan team and can no longer be deleted.",
            repo.deleteProject(second)
        )
        assertEquals(listOf("app-2"), dao.allIds())
    }

    private suspend fun FakeProjectDao.allIds() = getAllProjects().first().map { it.id }
}
