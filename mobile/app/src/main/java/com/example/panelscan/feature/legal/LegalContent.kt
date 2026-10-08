package com.example.panelscan.feature.legal

data class LegalSection(
    val id: String,
    val title: String,
    val paragraphs: List<String>,
    val bullets: List<String> = emptyList()
)

data class LegalDocument(
    val eyebrow: String,
    val title: String,
    val introduction: String,
    val lastUpdated: String = "August 2026",
    val advisoryNotice: String = "These terms and policies are written for the current and planned PanelScan service. Business-specific details that have not yet been published should be confirmed through PanelScan support before relying on them.",
    val sections: List<LegalSection>
)

object LegalContent {

    val privacyPolicy = LegalDocument(
        eyebrow = "Privacy",
        title = "Privacy Policy",
        introduction = "How PanelScan may handle account, commerce, support, installation, and mobile-generated project information as the service develops.",
        lastUpdated = "August 2026",
        sections = listOf(
            LegalSection(
                id = "scope",
                title = "Scope of this policy",
                paragraphs = listOf(
                    "This Privacy Policy explains how information may be handled when you use the PanelScan website, customer account, ordering and support tools, and the PanelScan mobile application when it becomes available. Features that are not yet connected may display clearly marked preview data rather than real customer information.",
                    "The service may evolve, so the information actually collected depends on the features you choose to use and the integrations that are active at that time."
                )
            ),
            LegalSection(
                id = "information",
                title = "Information we may collect",
                paragraphs = listOf(
                    "PanelScan may collect information you provide directly, information created through transactions and service requests, and limited technical information needed to operate and protect the service."
                ),
                bullets = listOf(
                    "Account details such as name, email address, phone number, role, and account status.",
                    "Contact, delivery, and installation information you submit.",
                    "Order records, selected products, quantities, status, and related customer-service history.",
                    "Installation requests, preferred schedules, site details, and assignment information.",
                    "Messages, support requests, feedback, ratings, and files or images you choose to send.",
                    "Measurement and project information, including room or surface names, dimensions, calculated areas, panel selections, estimates, preview images, and project status.",
                    "Technical information such as browser or app version, device type, diagnostic events, security events, and basic usage information needed to operate the service."
                )
            ),
            LegalSection(
                id = "payments",
                title = "Payment information",
                paragraphs = listOf(
                    "Payments may be processed by an external payment provider. The provider may collect and process payment credentials, verification information, and transaction details under its own privacy policy.",
                    "PanelScan may receive limited payment information such as transaction identifiers, amount, status, timestamps, and the payment method category needed to reconcile an order. PanelScan does not claim to store full payment-card numbers or card security codes."
                )
            ),
            LegalSection(
                id = "use",
                title = "How information is used",
                paragraphs = listOf(
                    "Information may be used to provide accounts and authenticated features, display products and pricing, process and fulfil orders, coordinate delivery and installation, answer support requests, maintain transaction and project records, and communicate service updates.",
                    "Information may also be used to secure accounts, prevent misuse, diagnose faults, maintain inventory and operational reporting, improve the interface, and comply with lawful obligations."
                )
            ),
            LegalSection(
                id = "measurements",
                title = "Measurements, estimates, and project results",
                paragraphs = listOf(
                    "Project information may be used to calculate areas, estimate panel quantities and material cost, organize customer projects, support installation planning, and display saved results across compatible PanelScan experiences.",
                    "Measurement and estimation results should be treated as assistive planning information. If a project is shared with PanelScan staff or an installer for service, relevant measurements, notes, images, and estimates may be available to those authorized participants."
                )
            ),
            LegalSection(
                id = "mobile-ar",
                title = "Mobile camera, AR, and device capabilities",
                paragraphs = listOf(
                    "When a PanelScan mobile application and its measurement features become available, the app may request access to camera, motion, depth, or other device capabilities needed to measure surfaces or create visual previews. The permission request and the app's behavior should describe the capability being used at that time.",
                    "This policy does not claim that every camera frame, room image, scan, mesh, or sensor reading is uploaded or retained. Any implemented collection, processing, storage, or deletion behavior should be documented when the mobile feature is released. The PanelScan website does not request camera access for AR measurement."
                )
            ),
            LegalSection(
                id = "sharing",
                title = "Service providers and sharing",
                paragraphs = listOf(
                    "PanelScan may share information with service providers only as reasonably needed for their role, such as website and database hosting, communications, diagnostics, storage, payment processing, delivery, and installation coordination.",
                    "Order and delivery information may be shared with delivery providers, while installation and project information may be shared with assigned installers or operational staff. Payment providers process payment information independently under their own terms. PanelScan does not treat preview data as real customer data."
                )
            ),
            LegalSection(
                id = "legal",
                title = "Legal requirements and protection",
                paragraphs = listOf(
                    "Information may be preserved or disclosed where required by applicable law, a valid legal process, or a lawful request, or where reasonably necessary to protect customers, staff, the public, the service, or legal rights.",
                    "PanelScan may also use relevant records to investigate fraud, security incidents, abuse, payment disputes, or violations of service terms."
                )
            ),
            LegalSection(
                id = "security",
                title = "Security",
                paragraphs = listOf(
                    "PanelScan uses technical and organizational safeguards appropriate to the service, such as authenticated access, role-based backend authorization, protected hosting configuration, and limited access to operational data. No online service or storage method can guarantee absolute security.",
                    "Keep your account credentials confidential, use a unique password, and contact PanelScan if you suspect unauthorized access. Do not send passwords, full card information, or private access tokens through ordinary support messages."
                )
            ),
            LegalSection(
                id = "retention",
                title = "Retention",
                paragraphs = listOf(
                    "Information is retained for as long as reasonably necessary for the purposes described here, including account operation, fulfilment, customer support, project continuity, security, record keeping, dispute handling, and legal obligations.",
                    "Retention can vary by category and context. This policy does not invent a fixed period. Information may be deleted, anonymized, or retained longer where required or permitted for legitimate and lawful reasons."
                )
            ),
            LegalSection(
                id = "rights",
                title = "Your choices and rights",
                paragraphs = listOf(
                    "Depending on applicable law and the circumstances, you may have rights to request access to, correction of, or deletion of certain personal information, to object to or restrict certain uses, or to receive information about processing.",
                    "Requests may require identity verification and may be limited where records must be kept for transactions, security, legal obligations, or the rights of others. You can also update some account details through available account features or contact support."
                )
            ),
            LegalSection(
                id = "cookies",
                title = "Cookies and local storage",
                paragraphs = listOf(
                    "The website may use cookies, browser storage, or similar technologies for essential session functions, security, preferences, cart or account continuity, and service operation. The current web application may also keep authentication tokens in browser storage after a successful backend login.",
                    "Optional analytics or additional tracking should be described and offered with appropriate controls when enabled. You can use browser settings to manage storage, but blocking essential storage may prevent account or checkout features from working."
                )
            ),
            LegalSection(
                id = "children-transfers",
                title = "Special contexts and data location",
                paragraphs = listOf(
                    "PanelScan is intended for customers able to enter into the relevant purchase or service arrangements. If information relating to another person is submitted for delivery, installation, or a shared project, you should have authority to provide it.",
                    "Hosting and service providers may process information in locations different from yours. Appropriate safeguards should be used where required, but this policy does not claim a specific hosting location or cross-border compliance framework that has not been confirmed."
                )
            ),
            LegalSection(
                id = "changes-contact",
                title = "Policy changes and contact",
                paragraphs = listOf(
                    "PanelScan may update this policy as website, backend, payment, delivery, installation, mobile AR, 3D, and measurement features develop. The updated page will show a revised date, and material changes may be communicated through an appropriate service channel.",
                    "For privacy questions or requests, use the support or messaging channel made available through PanelScan or the business contact information provided with your order or service interaction. No Data Protection Officer or specific legal entity contact is named here because those details have not been provided."
                )
            )
        )
    )

    val termsOfService = LegalDocument(
        eyebrow = "Legal",
        title = "Terms of Service",
        introduction = "Terms for using PanelScan's storefront, customer portal, ordering, installation coordination, and current or future mobile measurement tools.",
        lastUpdated = "August 2026",
        sections = listOf(
            LegalSection(
                id = "acceptance",
                title = "Acceptance of these terms",
                paragraphs = listOf(
                    "These Terms of Service govern access to and use of the PanelScan website, customer portal, related mobile experiences when available, product ordering tools, measurement and estimation features, and services coordinated through PanelScan. By using the service, creating an account, or placing an order, you agree to these terms.",
                    "If you do not agree, do not use the service. Additional terms shown for a particular order, payment provider, delivery, installation, or mobile feature may also apply where they are presented before use."
                )
            ),
            LegalSection(
                id = "accounts",
                title = "Account responsibilities",
                paragraphs = listOf(
                    "You are responsible for providing accurate account and contact information, maintaining the confidentiality of your sign-in details, and notifying PanelScan if you believe your account has been accessed without permission.",
                    "You may not share staff or administrative access, impersonate another person, or use another customer's project, order, or measurement records without authorization. PanelScan may restrict access where reasonably necessary to protect customers, the service, or business operations."
                )
            ),
            LegalSection(
                id = "products-pricing",
                title = "Products and pricing",
                paragraphs = listOf(
                    "Product descriptions, dimensions, finishes, availability, and prices are presented for customer planning and ordering. Prices may change before an order is placed, and pricing visible in a customer account does not guarantee future availability or price.",
                    "Taxes, delivery, installation, accessories, trims, preparation work, and other charges may be shown separately where applicable. A displayed estimate is not a final quotation unless PanelScan expressly confirms it as such."
                )
            ),
            LegalSection(
                id = "orders",
                title = "Orders",
                paragraphs = listOf(
                    "An order is a request to purchase the listed products. PanelScan may review product availability, quantities, delivery details, and other order information before fulfilment. An automated acknowledgement does not necessarily mean every item has been accepted or reserved.",
                    "PanelScan may contact you to clarify an order or may decline or adjust an order when an item is unavailable, information is incomplete, pricing is clearly erroneous, or fulfilment is not reasonably possible. Any resulting payment handling will follow the applicable payment-provider and customer-service process."
                )
            ),
            LegalSection(
                id = "payment",
                title = "Payment",
                paragraphs = listOf(
                    "Payments may be processed through an external payment provider. That provider may apply its own terms, privacy practices, verification steps, and transaction limits. PanelScan does not ask you to provide full payment-card details through ordinary support messages.",
                    "An order may remain pending until the payment provider and PanelScan confirm the relevant transaction status. Do not close or repeat a payment solely because a status update is delayed; contact support if the result is unclear."
                )
            ),
            LegalSection(
                id = "delivery",
                title = "Delivery",
                paragraphs = listOf(
                    "Delivery availability, timing, fees, and hand-off arrangements depend on the order, destination, product handling needs, and delivery provider. Any date or time shown before final confirmation is an estimate and may be affected by stock, transport, access, weather, or other circumstances.",
                    "You are responsible for providing an accurate delivery location and a suitable person or process to receive the goods. Inspect deliveries promptly and report visible issues through the available support channel with appropriate order information."
                )
            ),
            LegalSection(
                id = "installation",
                title = "Installation services",
                paragraphs = listOf(
                    "Installation may be arranged separately from product purchase and remains subject to scheduling, site access, surface condition, safety, installer availability, and confirmation by the PanelScan or Disenyo Interior Solution team.",
                    "Customers should disclose relevant site conditions and ensure safe, lawful access. Additional preparation, repairs, electrical work, structural work, removal, or specialist services are not included unless explicitly confirmed. Installation timing and price should be verified before work begins."
                )
            ),
            LegalSection(
                id = "measurements",
                title = "Measurements and estimates",
                paragraphs = listOf(
                    "Dimensions, area calculations, panel quantities, material costs, reports, and other estimates are assistive planning outputs. They may depend on values entered by a user, product coverage data, waste allowances, room geometry, obstructions, and assumptions that require site verification.",
                    "Measurements and estimates must be checked before ordering final quantities, cutting material, committing to installation, or relying on a budget. PanelScan may update estimation logic or product coverage information as the service develops."
                )
            ),
            LegalSection(
                id = "mobile-ar",
                title = "AR, 3D, and mobile measurement disclaimer",
                paragraphs = listOf(
                    "AR and 3D measurement features, when available, are intended for the PanelScan mobile application. The website may display project results saved by the mobile app but does not represent that AR measurement runs in the browser.",
                    "AR and 3D results may vary because of device capability, camera and sensor quality, environment, lighting, calibration, user movement and input, surface detection, image quality, obstructions, and other technical factors. Visual previews are illustrative and may not reproduce exact scale, alignment, colour, texture, lighting, or installed appearance.",
                    "Always independently verify measurements and estimates before final installation or material cutting. A mobile-generated result does not replace professional site assessment where one is appropriate."
                )
            ),
            LegalSection(
                id = "imagery",
                title = "Product imagery and finish variation",
                paragraphs = listOf(
                    "Product images, room scenes, thumbnails, and 3D previews may be representative. Screen settings, photography, lighting, production batches, surface texture, and surrounding materials can affect perceived colour and finish.",
                    "Where colour, grain, profile, or pattern matching is important, confirm the current product specification and, where available, review an appropriate physical sample before ordering or installation."
                )
            ),
            LegalSection(
                id = "stock",
                title = "Availability and stock",
                paragraphs = listOf(
                    "Stock indicators are operational information and may change as orders, returns, adjustments, or supplier deliveries are processed. An item shown as available is not necessarily reserved until the applicable order process is complete.",
                    "PanelScan may substitute nothing without your agreement. If an item becomes unavailable, the team may discuss alternatives, revised timing, order adjustment, or cancellation of the affected item."
                )
            ),
            LegalSection(
                id = "cancellations",
                title = "Cancellations and refunds",
                paragraphs = listOf(
                    "Cancellation, return, replacement, and refund options depend on the product, order status, condition, customization, applicable customer rights, payment status, and any policy communicated for the transaction. Contact PanelScan promptly if you need to change or cancel an order.",
                    "Do not assume a specific cancellation window, return period, warranty, or refund entitlement unless it has been provided for your order or is required by applicable law. Nothing in these terms limits mandatory consumer rights that cannot lawfully be excluded."
                )
            ),
            LegalSection(
                id = "intellectual-property",
                title = "Intellectual property",
                paragraphs = listOf(
                    "The PanelScan service, branding, interface, original text, graphics, software, estimation presentation, and related materials are owned by or licensed to the relevant PanelScan service operator, except for third-party materials identified as such.",
                    "You may use the service for legitimate personal or business purchasing and project-planning purposes. You may not copy, resell, reverse engineer, scrape, or commercially exploit protected service content except where permitted by law or written authorization."
                )
            ),
            LegalSection(
                id = "prohibited-use",
                title = "Prohibited use",
                paragraphs = listOf(
                    "You must not misuse PanelScan, interfere with its security or availability, probe protected systems, submit malicious code, automate abusive traffic, upload unlawful content, misrepresent measurements or identity, infringe others' rights, or use the service for fraudulent or unlawful activity.",
                    "You must not use demo or preview interfaces as evidence of a real transaction, approval, inventory record, customer record, or administrative decision."
                )
            ),
            LegalSection(
                id = "third-parties",
                title = "Third-party services",
                paragraphs = listOf(
                    "PanelScan may rely on payment processors, hosting providers, communications services, delivery providers, installers, mapping or storage services, and mobile-platform capabilities. Third-party services may be governed by their own terms and privacy practices.",
                    "Links or integrations do not guarantee a third party's continuous availability. PanelScan is responsible for its own service obligations but does not control independent third-party systems."
                )
            ),
            LegalSection(
                id = "liability",
                title = "Service availability and limitation of liability",
                paragraphs = listOf(
                    "PanelScan is provided on an as-available basis. The service may occasionally be interrupted for maintenance, changes, provider outages, security work, or circumstances beyond reasonable control. Preview and fallback data are not live business records.",
                    "To the extent permitted by applicable law, PanelScan is not responsible for indirect or consequential loss arising solely from reliance on unverified measurements, estimates, visual previews, availability indicators, or third-party services. This section does not exclude liability or rights that cannot lawfully be excluded."
                )
            ),
            LegalSection(
                id = "changes-contact",
                title = "Changes, applicable law, and contact",
                paragraphs = listOf(
                    "PanelScan may update these terms as products, mobile features, legal requirements, or operating practices change. The updated version will show a revised date, and material changes may be communicated through an appropriate service channel.",
                    "These terms are subject to applicable law and mandatory consumer protections. Any governing law or dispute forum not specifically communicated for a transaction will be determined under applicable legal rules rather than invented here.",
                    "For questions about these terms, an order, delivery, installation, or measurement result, use the support or messaging channel made available on the PanelScan website or the business contact information provided with your transaction."
                )
            )
        )
    )
}
