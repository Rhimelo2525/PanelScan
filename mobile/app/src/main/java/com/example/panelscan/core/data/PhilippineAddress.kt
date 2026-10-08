package com.example.panelscan.core.data

/**
 * Compact local Philippine address dataset.
 * Covers all 17 regions, all provinces, major cities/municipalities, and sample barangays.
 * Used entirely on-device — no network calls.
 */
object PhilippineAddress {

    data class Region(val code: String, val name: String)
    data class Province(val name: String, val regionCode: String)
    data class City(val name: String, val provinceName: String)
    data class Barangay(val name: String, val cityName: String)

    val regions = listOf(
        Region("NCR", "NCR — Metro Manila"),
        Region("CAR", "CAR — Cordillera Administrative Region"),
        Region("I", "Region I — Ilocos Region"),
        Region("II", "Region II — Cagayan Valley"),
        Region("III", "Region III — Central Luzon"),
        Region("IV-A", "Region IV-A — CALABARZON"),
        Region("IV-B", "Region IV-B — MIMAROPA"),
        Region("V", "Region V — Bicol Region"),
        Region("VI", "Region VI — Western Visayas"),
        Region("VII", "Region VII — Central Visayas"),
        Region("VIII", "Region VIII — Eastern Visayas"),
        Region("IX", "Region IX — Zamboanga Peninsula"),
        Region("X", "Region X — Northern Mindanao"),
        Region("XI", "Region XI — Davao Region"),
        Region("XII", "Region XII — SOCCSKSARGEN"),
        Region("XIII", "Region XIII — CARAGA"),
        Region("BARMM", "BARMM — Bangsamoro")
    )

    private val provinces: List<Province> = listOf(
        // NCR — no provinces, cities are direct
        Province("Metro Manila", "NCR"),
        // CAR
        Province("Abra", "CAR"), Province("Apayao", "CAR"), Province("Benguet", "CAR"),
        Province("Ifugao", "CAR"), Province("Kalinga", "CAR"), Province("Mountain Province", "CAR"),
        // Region I
        Province("Ilocos Norte", "I"), Province("Ilocos Sur", "I"),
        Province("La Union", "I"), Province("Pangasinan", "I"),
        // Region II
        Province("Batanes", "II"), Province("Cagayan", "II"), Province("Isabela", "II"),
        Province("Nueva Vizcaya", "II"), Province("Quirino", "II"),
        // Region III
        Province("Aurora", "III"), Province("Bataan", "III"), Province("Bulacan", "III"),
        Province("Nueva Ecija", "III"), Province("Pampanga", "III"),
        Province("Tarlac", "III"), Province("Zambales", "III"),
        // Region IV-A
        Province("Batangas", "IV-A"), Province("Cavite", "IV-A"), Province("Laguna", "IV-A"),
        Province("Quezon", "IV-A"), Province("Rizal", "IV-A"),
        // Region IV-B
        Province("Marinduque", "IV-B"), Province("Occidental Mindoro", "IV-B"),
        Province("Oriental Mindoro", "IV-B"), Province("Palawan", "IV-B"), Province("Romblon", "IV-B"),
        // Region V
        Province("Albay", "V"), Province("Camarines Norte", "V"), Province("Camarines Sur", "V"),
        Province("Catanduanes", "V"), Province("Masbate", "V"), Province("Sorsogon", "V"),
        // Region VI
        Province("Aklan", "VI"), Province("Antique", "VI"), Province("Capiz", "VI"),
        Province("Guimaras", "VI"), Province("Iloilo", "VI"), Province("Negros Occidental", "VI"),
        // Region VII
        Province("Bohol", "VII"), Province("Cebu", "VII"),
        Province("Negros Oriental", "VII"), Province("Siquijor", "VII"),
        // Region VIII
        Province("Biliran", "VIII"), Province("Eastern Samar", "VIII"), Province("Leyte", "VIII"),
        Province("Northern Samar", "VIII"), Province("Samar (Western Samar)", "VIII"),
        Province("Southern Leyte", "VIII"),
        // Region IX
        Province("Zamboanga del Norte", "IX"), Province("Zamboanga del Sur", "IX"),
        Province("Zamboanga Sibugay", "IX"),
        // Region X
        Province("Bukidnon", "X"), Province("Camiguin", "X"), Province("Lanao del Norte", "X"),
        Province("Misamis Occidental", "X"), Province("Misamis Oriental", "X"),
        // Region XI
        Province("Compostela Valley (Davao de Oro)", "XI"), Province("Davao del Norte", "XI"),
        Province("Davao del Sur", "XI"), Province("Davao Occidental", "XI"),
        Province("Davao Oriental", "XI"),
        // Region XII
        Province("Cotabato (North Cotabato)", "XII"), Province("Sarangani", "XII"),
        Province("South Cotabato", "XII"), Province("Sultan Kudarat", "XII"),
        // Region XIII
        Province("Agusan del Norte", "XIII"), Province("Agusan del Sur", "XIII"),
        Province("Dinagat Islands", "XIII"), Province("Surigao del Norte", "XIII"),
        Province("Surigao del Sur", "XIII"),
        // BARMM
        Province("Basilan", "BARMM"), Province("Lanao del Sur", "BARMM"),
        Province("Maguindanao del Norte", "BARMM"), Province("Maguindanao del Sur", "BARMM"),
        Province("Sulu", "BARMM"), Province("Tawi-Tawi", "BARMM")
    )

    private val cities: List<City> = listOf(
        // Metro Manila
        City("Caloocan", "Metro Manila"), City("Las Piñas", "Metro Manila"),
        City("Makati", "Metro Manila"), City("Malabon", "Metro Manila"),
        City("Mandaluyong", "Metro Manila"), City("Manila", "Metro Manila"),
        City("Marikina", "Metro Manila"), City("Muntinlupa", "Metro Manila"),
        City("Navotas", "Metro Manila"), City("Parañaque", "Metro Manila"),
        City("Pasay", "Metro Manila"), City("Pasig", "Metro Manila"),
        City("Pateros", "Metro Manila"), City("Quezon City", "Metro Manila"),
        City("San Juan", "Metro Manila"), City("Taguig", "Metro Manila"),
        City("Valenzuela", "Metro Manila"),
        // CAR
        City("Baguio City", "Benguet"), City("La Trinidad", "Benguet"), City("Tabuk City", "Kalinga"),
        City("Bangued", "Abra"), City("Lagawe", "Ifugao"), City("Bontoc", "Mountain Province"),
        // Region I
        City("Laoag City", "Ilocos Norte"), City("Batac City", "Ilocos Norte"),
        City("Vigan City", "Ilocos Sur"), City("San Fernando City", "La Union"),
        City("Dagupan City", "Pangasinan"), City("Alaminos City", "Pangasinan"),
        City("Urdaneta City", "Pangasinan"), City("San Carlos City", "Pangasinan"),
        // Region II
        City("Tuguegarao City", "Cagayan"), City("Ilagan City", "Isabela"),
        City("Santiago City", "Isabela"), City("Cauayan City", "Isabela"),
        City("Bayombong", "Nueva Vizcaya"),
        // Region III
        City("Malolos City", "Bulacan"), City("Meycauayan City", "Bulacan"),
        City("San Jose del Monte City", "Bulacan"), City("Marilao", "Bulacan"),
        City("Balanga City", "Bataan"), City("Olongapo City", "Zambales"),
        City("San Fernando City", "Pampanga"), City("Angeles City", "Pampanga"),
        City("Mabalacat City", "Pampanga"), City("Cabanatuan City", "Nueva Ecija"),
        City("San Jose City", "Nueva Ecija"), City("Palayan City", "Nueva Ecija"),
        City("Tarlac City", "Tarlac"), City("Baler", "Aurora"),
        // Region IV-A
        City("Antipolo City", "Rizal"), City("Cainta", "Rizal"), City("Taytay", "Rizal"),
        City("Bacoor City", "Cavite"), City("Dasmariñas City", "Cavite"),
        City("Imus City", "Cavite"), City("Tagaytay City", "Cavite"),
        City("Trece Martires City", "Cavite"), City("General Trias City", "Cavite"),
        City("Biñan City", "Laguna"), City("San Pedro City", "Laguna"),
        City("Cabuyao City", "Laguna"), City("Calamba City", "Laguna"),
        City("Santa Rosa City", "Laguna"), City("San Pablo City", "Laguna"),
        City("Batangas City", "Batangas"), City("Lipa City", "Batangas"),
        City("Tanauan City", "Batangas"), City("Sto. Tomas", "Batangas"),
        City("Lucena City", "Quezon"), City("Tayabas City", "Quezon"),
        // Region IV-B
        City("Puerto Princesa City", "Palawan"), City("Calapan City", "Oriental Mindoro"),
        City("Mamburao", "Occidental Mindoro"), City("Boac", "Marinduque"),
        // Region V
        City("Legazpi City", "Albay"), City("Tabaco City", "Albay"),
        City("Iriga City", "Camarines Sur"), City("Naga City", "Camarines Sur"),
        City("Masbate City", "Masbate"), City("Sorsogon City", "Sorsogon"),
        City("Daet", "Camarines Norte"), City("Virac", "Catanduanes"),
        // Region VI
        City("Iloilo City", "Iloilo"), City("Passi City", "Iloilo"),
        City("Bacolod City", "Negros Occidental"), City("Bago City", "Negros Occidental"),
        City("Sagay City", "Negros Occidental"), City("San Carlos City", "Negros Occidental"),
        City("Silay City", "Negros Occidental"), City("Talisay City", "Negros Occidental"),
        City("Roxas City", "Capiz"), City("Kalibo", "Aklan"),
        // Region VII
        City("Cebu City", "Cebu"), City("Lapu-Lapu City", "Cebu"),
        City("Mandaue City", "Cebu"), City("Talisay City", "Cebu"),
        City("Toledo City", "Cebu"), City("Carcar City", "Cebu"),
        City("Danao City", "Cebu"), City("Naga City", "Cebu"),
        City("Tagbilaran City", "Bohol"), City("Dumaguete City", "Negros Oriental"),
        City("Bais City", "Negros Oriental"), City("Canlaon City", "Negros Oriental"),
        // Region VIII
        City("Tacloban City", "Leyte"), City("Ormoc City", "Leyte"),
        City("Calbayog City", "Samar (Western Samar)"), City("Catbalogan City", "Samar (Western Samar)"),
        City("Maasin City", "Southern Leyte"),
        // Region IX
        City("Zamboanga City", "Zamboanga del Sur"), City("Pagadian City", "Zamboanga del Sur"),
        City("Dapitan City", "Zamboanga del Norte"), City("Dipolog City", "Zamboanga del Norte"),
        City("Ipil", "Zamboanga Sibugay"),
        // Region X
        City("Cagayan de Oro City", "Misamis Oriental"), City("El Salvador City", "Misamis Oriental"),
        City("Gingoog City", "Misamis Oriental"), City("Iligan City", "Lanao del Norte"),
        City("Malaybalay City", "Bukidnon"), City("Valencia City", "Bukidnon"),
        City("Oroquieta City", "Misamis Occidental"), City("Ozamiz City", "Misamis Occidental"),
        City("Tangub City", "Misamis Occidental"), City("Mambajao", "Camiguin"),
        // Region XI
        City("Davao City", "Davao del Sur"), City("Tagum City", "Davao del Norte"),
        City("Panabo City", "Davao del Norte"), City("Island Garden City of Samal", "Davao del Norte"),
        City("Digos City", "Davao del Sur"), City("Mati City", "Davao Oriental"),
        // Region XII
        City("General Santos City", "South Cotabato"), City("Koronadal City", "South Cotabato"),
        City("Kidapawan City", "Cotabato (North Cotabato)"),
        City("Tacurong City", "Sultan Kudarat"), City("Alabel", "Sarangani"),
        // Region XIII
        City("Butuan City", "Agusan del Norte"), City("Cabadbaran City", "Agusan del Norte"),
        City("Bayugan City", "Agusan del Sur"),
        City("Surigao City", "Surigao del Norte"), City("Bislig City", "Surigao del Sur"),
        City("Tandag City", "Surigao del Sur"), City("San Francisco", "Agusan del Sur"),
        // BARMM
        City("Cotabato City", "Maguindanao del Norte"),
        City("Marawi City", "Lanao del Sur"), City("Lamitan City", "Basilan")
    )

    private val barangays: List<Barangay> = listOf(
        // Quezon City
        Barangay("Batasan Hills", "Quezon City"), Barangay("Commonwealth", "Quezon City"),
        Barangay("Cubao", "Quezon City"), Barangay("Diliman", "Quezon City"),
        Barangay("Fairview", "Quezon City"), Barangay("Holy Spirit", "Quezon City"),
        Barangay("Kamuning", "Quezon City"), Barangay("Loyola Heights", "Quezon City"),
        Barangay("Novaliches", "Quezon City"), Barangay("Tandang Sora", "Quezon City"),
        // Manila
        Barangay("Binondo", "Manila"), Barangay("Ermita", "Manila"),
        Barangay("Intramuros", "Manila"), Barangay("Malate", "Manila"),
        Barangay("Paco", "Manila"), Barangay("Pandacan", "Manila"),
        Barangay("Quiapo", "Manila"), Barangay("Sampaloc", "Manila"),
        Barangay("San Andres Bukid", "Manila"), Barangay("Tondo", "Manila"),
        // Makati
        Barangay("Bel-Air", "Makati"), Barangay("Forbes Park", "Makati"),
        Barangay("Guadalupe Nuevo", "Makati"), Barangay("Guadalupe Viejo", "Makati"),
        Barangay("Legazpi Village", "Makati"), Barangay("Poblacion", "Makati"),
        Barangay("Rockwell", "Makati"), Barangay("San Lorenzo", "Makati"),
        // Taguig
        Barangay("BGC (Fort Bonifacio)", "Taguig"), Barangay("Hagonoy", "Taguig"),
        Barangay("Napindan", "Taguig"), Barangay("Palingon", "Taguig"),
        Barangay("Tuktukan", "Taguig"), Barangay("Upper Bicutan", "Taguig"),
        Barangay("Western Bicutan", "Taguig"), Barangay("Wawa", "Taguig"),
        // Pasig
        Barangay("Bagong Ilog", "Pasig"), Barangay("Kapitolyo", "Pasig"),
        Barangay("Ortigas Center", "Pasig"), Barangay("Rosario", "Pasig"),
        Barangay("San Antonio", "Pasig"), Barangay("Ugong", "Pasig"),
        // Pasay
        Barangay("Baclaran", "Pasay"), Barangay("Malibay", "Pasay"),
        Barangay("Quirino Ave Area", "Pasay"), Barangay("San Isidro", "Pasay"),
        // Marikina
        Barangay("Calumpang", "Marikina"), Barangay("Concepcion Uno", "Marikina"),
        Barangay("Nangka", "Marikina"), Barangay("Parang", "Marikina"),
        Barangay("Sta. Elena", "Marikina"), Barangay("Tumana", "Marikina"),
        // Parañaque
        Barangay("BF Homes", "Parañaque"), Barangay("Don Bosco", "Parañaque"),
        Barangay("La Huerta", "Parañaque"), Barangay("San Dionisio", "Parañaque"),
        Barangay("Sucat", "Parañaque"), Barangay("Tambo", "Parañaque"),
        // Las Piñas
        Barangay("Almanza Uno", "Las Piñas"), Barangay("Almanza Dos", "Las Piñas"),
        Barangay("Daniel Fajardo", "Las Piñas"), Barangay("Elias Aldana", "Las Piñas"),
        Barangay("Moonwalk", "Las Piñas"), Barangay("Talon Uno", "Las Piñas"),
        // Muntinlupa
        Barangay("Alabang", "Muntinlupa"), Barangay("Ayala Alabang Village", "Muntinlupa"),
        Barangay("Buli", "Muntinlupa"), Barangay("Cupang", "Muntinlupa"),
        Barangay("Poblacion", "Muntinlupa"), Barangay("Tunasan", "Muntinlupa"),
        // Cebu City
        Barangay("Banilad", "Cebu City"), Barangay("Capitol Site", "Cebu City"),
        Barangay("Guadalupe", "Cebu City"), Barangay("Lahug", "Cebu City"),
        Barangay("Mabolo", "Cebu City"), Barangay("Pardo", "Cebu City"),
        Barangay("Sambag I", "Cebu City"), Barangay("Talamban", "Cebu City"),
        // Davao City
        Barangay("Agdao", "Davao City"), Barangay("Buhangin", "Davao City"),
        Barangay("Malibay", "Davao City"), Barangay("Poblacion District", "Davao City"),
        Barangay("Talomo", "Davao City"), Barangay("Toril", "Davao City"),
        // Cagayan de Oro City
        Barangay("Carmen", "Cagayan de Oro City"), Barangay("Consolacion", "Cagayan de Oro City"),
        Barangay("Lapasan", "Cagayan de Oro City"), Barangay("Macabalan", "Cagayan de Oro City"),
        Barangay("Nazareth", "Cagayan de Oro City"), Barangay("Poblacion", "Cagayan de Oro City"),
        // City of San Jose del Monte (PSA PSGC)
        Barangay("San Manuel", "San Jose del Monte City")
    )

    fun provincesFor(regionCode: String): List<String> =
        provinces.filter { it.regionCode == regionCode }.map { it.name }.sorted()

    fun citiesFor(provinceName: String): List<String> =
        cities.filter { it.provinceName == provinceName }.map { it.name }.sorted()

    fun barangaysFor(cityName: String): List<String> =
        barangays.filter { it.cityName == cityName }.map { it.name }.sorted()

    fun findProvinceForCity(cityName: String): String? =
        cities.firstOrNull { it.name.equals(cityName, ignoreCase = true) }?.provinceName

    fun findRegionForProvince(provinceName: String): Region? {
        val p = provinces.firstOrNull { it.name.equals(provinceName, ignoreCase = true) } ?: return null
        return regions.firstOrNull { it.code == p.regionCode }
    }

    fun allCities(): List<String> = cities.map { it.name }.distinct().sorted()

    fun allProvinces(): List<String> = provinces.map { it.name }.distinct().sorted()
}
