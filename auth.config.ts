
// import type { NextAuthConfig } from "next-auth";

// const authConfig = {
//   session: { strategy: "jwt" },
//   pages: { signIn: "/login" },
//   callbacks: {
//     authorized({ auth, request }) {
//       const path = request.nextUrl.pathname;

//       const protectedRoute =
//         path.startsWith("/dashboard") ||
//         path.startsWith("/inventory") ||
//         path.startsWith("/admin");

//       if (!protectedRoute) return true;

//       return Boolean(auth?.user?.id);
//     },
//   },
//   providers: [],
// } satisfies NextAuthConfig;

// export default authConfig;

import type { NextAuthConfig } from "next-auth";

const authConfig = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  callbacks: {
    authorized({ auth, request }) {
      const path = request.nextUrl.pathname;

      const protectedRoute =
        path.startsWith("/dashboard") ||
        path.startsWith("/inventory") ||
        path.startsWith("/admin");

      if (!protectedRoute) return true;

      return Boolean(auth?.user);
    },
  },
  providers: [],
} satisfies NextAuthConfig;

export default authConfig;