plugins {
    kotlin("multiplatform")
}

kotlin {
    jvm("desktop")

    sourceSets {
        commonTest.dependencies {
            implementation(kotlin("test"))
            implementation(project(":token-api"))
        }
    }
}
