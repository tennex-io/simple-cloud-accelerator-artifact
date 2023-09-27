module.exports = {
  env: {
    es2020: true,
    jest: true,
    node: true,
  },
  extends: ["eslint:recommended"],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 12,
    sourceType: "module",
  },
  plugins: ["import", "@typescript-eslint"],
  reportUnusedDisableDirectives: true,
  settings: {
    "import/resolver": {
      node: {
        extensions: [".js", ".jsx", ".ts", ".tsx", ".json"],
      },
      typescript: {
        alwaysTryTypes: true,
      },
    },
  },
  rules: {
    "no-unused-vars": "off",
    "@typescript-eslint/no-unused-vars": [
        "warn",
        { "argsIgnorePattern": "^context" }
    ]
  }
};
