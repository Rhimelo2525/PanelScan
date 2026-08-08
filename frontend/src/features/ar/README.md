# features/ar

AR measurement capture + panel estimate UI, built on `api/ar.api.ts`. The AR
camera/scanning experience itself is entirely a mobile-SDK concern with no
backend code involved — this feature only needs to persist the resulting
measurement and display the estimate the backend calculates from it.
