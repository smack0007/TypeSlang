namespace JS {
class Error {
private:
  const char *message;

public:
  Error(const char *message = "") : message(message) {}
};
} // namespace JS