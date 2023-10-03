#include <cstring>
#include <fmt/format.h>

class JSString {
public:
  const char* data;
  size_t length;

  JSString(const char* data) {
    this->data = data;
    this->length = strlen(data);
  }
  
  JSString(const char* data, size_t length) {
    this->data = data;
    this->length = length;
  }

  JSString(const JSString& source) {
    this->data = source.data;
    this->length = source.length;
  }

  JSString(JSString&& source) {
    this->data = source.data;
    this->length = source.length;
  }

  // operator char*() {
  //   return this->data;
  // }

  JSString operator+(const char* otherData) {
    size_t otherLength = strlen(otherData);
    size_t newLength = this->length + otherLength;
    char* newData = new char[newLength + 1];

    strncpy(newData, this->data, this->length);
    strncpy(newData + this->length, otherData, otherLength);
    newData[newLength] = '\0';

    return JSString(newData, newLength);
  }

  JSString operator+(JSString& other) {
    size_t newLength = this->length + other.length;
    char* newData = new char[newLength + 1];

    strncpy(newData, this->data, this->length);
    strncpy(newData + this->length, other.data, other.length);
    newData[newLength] = '\0';

    return JSString(newData, newLength);
  }
};

template<>
struct fmt::formatter<JSString>
{
  template<typename ParseContext>
  constexpr auto parse(ParseContext& ctx) {
    return ctx.begin();
  }

  template<typename FormatContext>
  auto format(JSString const& string, FormatContext& ctx) {
    return fmt::format_to(ctx.out(), "{0}", string.data);
  }
};
